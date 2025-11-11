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


async function clearAllStorage() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!confirm('🚨 Clear ALL storage (localStorage, sessionStorage, cookies) for this site?\n\nThis will log you out and reset all site preferences!')) {
            return;
        }

        // Show loading state
        const clearBtn = document.getElementById('clear-all-btn');
        const originalText = clearBtn.textContent;
        clearBtn.textContent = '⏳ Clearing...';
        clearBtn.disabled = true;

        let successCount = 0;
        let totalItems = 0;

        // Step 1: Get current data to know what we're deleting
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: getStorageData
        });

        if (results[0].result) {
            const data = results[0].result;
            
            // Count total items
            totalItems = Object.keys(data.local).length + 
                        Object.keys(data.session).length + 
                        Object.keys(data.cookies).length;

            // Step 2: Delete localStorage items one by one
            for (const key of Object.keys(data.local)) {
                const success = await deleteIndividualItem('local', key, tab);
                if (success) successCount++;
                await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
            }

            // Step 3: Delete sessionStorage items one by one  
            for (const key of Object.keys(data.session)) {
                const success = await deleteIndividualItem('session', key, tab);
                if (success) successCount++;
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            // Step 4: Delete cookies one by one (most reliable method)
            for (const key of Object.keys(data.cookies)) {
                const success = await deleteIndividualItem('cookies', key, tab);
                if (success) successCount++;
                await new Promise(resolve => setTimeout(resolve, 50)); // Longer delay for cookies
            }
        }

        // Step 5: Final cleanup pass
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: () => {
                localStorage.clear();
                sessionStorage.clear();
            }
        });

        // Restore button state
        clearBtn.textContent = originalText;
        clearBtn.disabled = false;

        // Refresh and show results
        loadStorageData();

        // Show detailed results
        if (successCount > 0) {
            alert(`✅ Successfully cleared ${successCount} out of ${totalItems} items!\n\nSome items may regenerate automatically.`);
        } else {
            alert('❌ No items could be cleared. The site may be protecting its data.');
        }

    } catch (error) {
        console.error('❌ Clear all error:', error);
        
        // Restore button state on error
        const clearBtn = document.getElementById('clear-all-btn');
        clearBtn.textContent = '🗑️ Clear All';
        clearBtn.disabled = false;
        
        alert('Error clearing storage: ' + error.message);
    }
}

// Helper function for individual item deletion
async function deleteIndividualItem(storageType, key, tab) {
    try {
        if (storageType === 'cookies') {
            // Use the reliable individual cookie deletion
            const url = new URL(tab.url);
            const domain = url.hostname;
            
            const details = {
                name: key,
                url: tab.url
            };
            
            try {
                const removed = await chrome.cookies.remove(details);
                if (removed) {
                    console.log(`✅ Deleted cookie: ${key}`);
                    return true;
                } else {
                    // Try alternative methods
                    const success = await deleteCookieAllMethods(key, domain, tab.url);
                    return success;
                }
            } catch (error) {
                console.error(`❌ Chrome API failed for ${key}:`, error);
                await fallbackDeleteCookie(key, tab);
                return true; // Assume success for fallback
            }
            
        } else {
            // localStorage and sessionStorage
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
            console.log(`✅ Deleted ${storageType} item: ${key}`);
            return true;
        }
    } catch (error) {
        console.error(`❌ Failed to delete ${storageType} item ${key}:`, error);
        return false;
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