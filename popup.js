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

    // Cookies
    document.cookie.split(';').forEach(cookie => {
        const [key, value] = cookie.split('=').map(s => s.trim());
        if (key) {
            data.cookies[key] = value || '';
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
            
            html += `
                <div class="item">
                    <button class="delete-btn" data-type="${type}" data-key="${escapeHtml(key)}">×</button>
                    <div class="key">${escapeHtml(key)}</div>
                    <div class="value">
                        ${isImage ? 
                            `<img src="${value}" class="image-preview" onclick="openImage('${value.replace(/'/g, "\\'")}')">` : 
                            escapeHtml(value && value.length > 100 ? value.substring(0, 100) + '...' : value)
                        }
                    </div>
                    <div class="meta">
                        ${isImage ? '🖼️ Image' : '📄 Text'} • ${(value || '').length} chars
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
        
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: (type, itemKey) => {
                if (type === 'local') {
                    localStorage.removeItem(itemKey);
                } else if (type === 'session') {
                    sessionStorage.removeItem(itemKey);
                } else if (type === 'cookies') {
                    document.cookie = `${itemKey}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
                }
            },
            args: [storageType, key]
        });

        // Refresh the data
        loadStorageData();
        
    } catch (error) {
        alert('Error deleting item: ' + error.message);
    }
}

async function clearAllStorage() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: () => {
                // Clear localStorage
                localStorage.clear();
                
                // Clear sessionStorage
                sessionStorage.clear();
                
                // Clear cookies
                document.cookie.split(';').forEach(cookie => {
                    const key = cookie.split('=')[0].trim();
                    document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
                });
                
                console.log('🗑️ All storage cleared for this site');
            }
        });

        // Refresh the data
        loadStorageData();
        alert('✅ All storage cleared! The page may need to be refreshed.');
        
    } catch (error) {
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