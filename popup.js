// Simple, robust version WITH DELETE FUNCTIONALITY
document.addEventListener('DOMContentLoaded', function() {
    loadStorageData();
    setupTabListeners();
    setupActionListeners();
});

function setupTabListeners() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            // Update active tab
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // Show correct content
            const tabName = this.dataset.tab;
            document.getElementById('local-content').style.display = 'none';
            document.getElementById('session-content').style.display = 'none';
            document.getElementById('cookies-content').style.display = 'none';
            document.getElementById(tabName + '-content').style.display = 'block';
        });
    });
}

function setupActionListeners() {
    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', function() {
        loadStorageData();
    });

    // Clear All button
    document.getElementById('clear-all-btn').addEventListener('click', function() {
        if (confirm('🚨 Clear ALL storage (localStorage, sessionStorage, cookies) for this site?\n\nThis will log you out and reset all site preferences!')) {
            clearAllStorage();
        }
    });
}

async function loadStorageData() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        document.getElementById('site-name').textContent = new URL(tab.url).hostname;

        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: getStorageData
        });

        if (results[0].result) {
            displayData(results[0].result);
        }
    } catch (error) {
        document.getElementById('local-content').innerHTML = '<div class="item">Error: ' + error.message + '</div>';
    }
}

function getStorageData() {
    const data = {
        local: {},
        session: {},
        cookies: {}
    };

    // Local Storage
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        data.local[key] = localStorage.getItem(key);
    }

    // Session Storage
    for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        data.session[key] = sessionStorage.getItem(key);
    }

    // Cookies - Enhanced parsing
    document.cookie.split(';').forEach(cookie => {
        const [key, ...valueParts] = cookie.split('=').map(s => s.trim());
        if (key) {
            data.cookies[key] = valueParts.join('=').trim() || '';
        }
    });

    return data;
}

function displayData(data) {
    displayStorageType('local', data.local);
    displayStorageType('session', data.session);
    displayStorageType('cookies', data.cookies);
}

function displayStorageType(type, items) {
    const container = document.getElementById(type + '-content');
    let html = '';

    if (Object.keys(items).length === 0) {
        html = '<div class="item">No items found</div>';
    } else {
        for (const [key, value] of Object.entries(items)) {
            const isImage = value && value.startsWith('data:image/');
            
            // Check if cookie might be HttpOnly (empty value often indicates HttpOnly)
            const isHttpOnly = type === 'cookies' && value === '';
            
            html += `
                <div class="item">
                    <button class="delete-btn" data-type="${type}" data-key="${escapeHtml(key)}" 
                            ${isHttpOnly ? 'title="HttpOnly cookie - may not be deletable"' : ''}>
                        ×
                    </button>
                    <div class="key">${escapeHtml(key)} ${isHttpOnly ? '🔒' : ''}</div>
                    <div class="value">
                        ${isImage ? 
                            `<img src="${value}" class="image-preview" onclick="openImage('${value.replace(/'/g, "\\'")}')">` : 
                            escapeHtml(value && value.length > 100 ? value.substring(0, 100) + '...' : value)
                        }
                    </div>
                    <div class="meta">
                        ${isImage ? '🖼️ Image' : '📄 Text'} • ${(value || '').length} chars
                        ${isHttpOnly ? '• 🔒 HttpOnly' : ''}
                    </div>
                </div>
            `;
        }
    }

    container.innerHTML = html;

    // Add event listeners to delete buttons
    container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const storageType = this.dataset.type;
            const key = this.dataset.key;
            
            if (confirm(`Delete "${key}" from ${storageType}?`)) {
                await deleteStorageItem(storageType, key);
            }
        });
    });
}

async function deleteStorageItem(storageType, key) {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (storageType === 'cookies') {
            // Use Chrome Cookies API for cookies
            const url = new URL(tab.url);
            const domain = url.hostname;
            
            // Try to delete the cookie using Chrome API
            const details = {
                name: key,
                url: tab.url
            };
            
            try {
                const removed = await chrome.cookies.remove(details);
                
                if (removed) {
                    console.log(`✅ Successfully deleted cookie: ${key}`);
                    loadStorageData();
                } else {
                    // If that didn't work, try with different domain patterns
                    console.log(`🔄 Trying alternative methods for: ${key}`);
                    await deleteCookieAllMethods(key, domain, tab.url);
                    loadStorageData();
                }
            } catch (error) {
                console.error(`❌ Chrome API failed for ${key}:`, error);
                // Fallback to legacy method
                await fallbackDeleteCookie(key, tab);
                loadStorageData();
            }
            
        } else {
            // Original localStorage/sessionStorage deletion code
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: (type, itemKey) => {
                    if (type === 'local') {
                        localStorage.removeItem(itemKey);
                    } else if (type === 'session') {
                        sessionStorage.removeItem(itemKey);
                    }
                },
                args: [storageType, key]
            });
            loadStorageData();
        }
        
    } catch (error) {
        console.error('❌ Delete error:', error);
        alert('Error deleting item: ' + error.message);
    }
}

async function deleteCookieAllMethods(cookieName, domain, url) {
    // Try multiple deletion strategies
    const deletionAttempts = [
        // Standard deletion
        { name: cookieName, url: url },
        // With domain variations
        { name: cookieName, url: `http://${domain}` },
        { name: cookieName, url: `https://${domain}` },
        { name: cookieName, url: `http://www.${domain}` },
        { name: cookieName, url: `https://www.${domain}` },
        // For subdomains
        { name: cookieName, url: `http://.${domain}` },
        { name: cookieName, url: `https://.${domain}` }
    ];
    
    for (const attempt of deletionAttempts) {
        try {
            const removed = await chrome.cookies.remove(attempt);
            if (removed) {
                console.log(`✅ Deleted via: ${attempt.url}`);
                return true;
            }
        } catch (e) {
            // Continue to next attempt
        }
    }
    
    console.log(`❌ All deletion methods failed for: ${cookieName}`);
    return false;
}

async function fallbackDeleteCookie(cookieName, tab) {
    // Legacy JavaScript method as last resort
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: (name) => {
            // Aggressive cookie deletion
            const paths = ['/', '/news', '/sport', '/weather', '/iplayer', '/music'];
            const domains = [
                window.location.hostname,
                '.' + window.location.hostname,
                'www.' + window.location.hostname
            ];
            
            for (const path of paths) {
                for (const domain of domains) {
                    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; domain=${domain};`;
                    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; domain=${domain}; secure`;
                }
            }
        },
        args: [cookieName]
    });
}

// Nuclear option - tries to break regeneration cycles
async function nuclearOption() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!confirm(`☢️ NUCLEAR OPTION\n\nThis will:\n• Clear ALL storage repeatedly\n• Try to disable regeneration scripts\n• May break site functionality\n• Requires page reload\n\nContinue?`)) {
            return;
        }

        // Step 1: Multiple rapid clear cycles
        for (let i = 0; i < 3; i++) {
            await clearAllStorage();
            await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
        }

        // Step 2: Try to inject script to break regeneration
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: () => {
                // Try to disrupt common regeneration patterns
                const originalSetItem = localStorage.setItem;
                const originalGetItem = localStorage.getItem;
                
                // Temporarily break localStorage
                localStorage.setItem = function() {
                    console.log('🚫 Storage set blocked by Privacy Inspector');
                    return false;
                };
                
                // Override common tracking functions
                const trackers = [
                    'dataLayer',
                    'ga',
                    'gtag',
                    'fbq',
                    '_gat',
                    '_ga'
                ];
                
                trackers.forEach(tracker => {
                    if (window[tracker]) {
                        window[tracker] = function() {
                            console.log(`🚫 ${tracker} blocked by Privacy Inspector`);
                        };
                    }
                });

                // Set a flag to indicate nuclear cleanup
                sessionStorage.setItem('_pi_nuclear_cleanup', 'true');
                
                console.log('☢️ Nuclear cleanup activated');
            }
        });

        // Step 3: Force page reload to break persistent scripts
        if (confirm('Nuclear cleanup complete! Reload the page to see results?')) {
            chrome.tabs.reload(tab.id);
        }

    } catch (error) {
        console.error('❌ Nuclear option failed:', error);
        alert('Nuclear option failed: ' + error.message);
    }
}

// Add event listener in setupActionListeners()
document.getElementById('nuclear-btn').addEventListener('click', nuclearOption);

async function clearAllStorage() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const url = new URL(tab.url);
        const domain = url.hostname;
        
        // Clear localStorage and sessionStorage
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: () => {
                localStorage.clear();
                sessionStorage.clear();
                console.log('🗑️ Cleared localStorage and sessionStorage');
            }
        });
        
        // Clear ALL cookies for this domain using Chrome API
        const allCookies = await chrome.cookies.getAll({ domain: domain });
        console.log(`🍪 Found ${allCookies.length} cookies to delete`);
        
        let deletedCount = 0;
        for (const cookie of allCookies) {
            try {
                const removed = await chrome.cookies.remove({
                    url: (cookie.secure ? 'https://' : 'http://') + cookie.domain + cookie.path,
                    name: cookie.name
                });
                if (removed) deletedCount++;
            } catch (error) {
                console.error(`Failed to delete cookie: ${cookie.name}`, error);
            }
        }
        
        // Also try broader domain patterns
        const domainPatterns = [
            domain,
            '.' + domain,
            'www.' + domain
        ];
        
        for (const pattern of domainPatterns) {
            const patternCookies = await chrome.cookies.getAll({ domain: pattern });
            for (const cookie of patternCookies) {
                try {
                    const removed = await chrome.cookies.remove({
                        url: (cookie.secure ? 'https://' : 'http://') + cookie.domain + cookie.path,
                        name: cookie.name
                    });
                    if (removed) deletedCount++;
                } catch (error) {
                    // Continue
                }
            }
        }
        
        console.log(`✅ Deleted ${deletedCount} cookies`);
        
        // Refresh and show results
        loadStorageData();
        
        // Show success message
        if (deletedCount > 0) {
            alert(`✅ Successfully cleared storage and deleted ${deletedCount} cookies!`);
        } else {
            alert('✅ Storage cleared, but no deletable cookies found.');
        }
        
    } catch (error) {
        console.error('❌ Clear all error:', error);
        alert('Error clearing storage: ' + error.message);
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Global functions for image viewing
window.openImage = function(imageSrc) {
    document.getElementById('modal-image').src = imageSrc;
    document.getElementById('image-modal').style.display = 'block';
};

window.closeModal = function() {
    document.getElementById('image-modal').style.display = 'none';
};

// Close modal when clicking outside image
document.addEventListener('click', function(event) {
    if (event.target.id === 'image-modal') {
        closeModal();
    }
});