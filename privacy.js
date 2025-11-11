// privacy.js - External script to avoid CSP issues
document.addEventListener('DOMContentLoaded', function() {
    const backLink = document.querySelector('.back a');
    
    if (backLink) {
        backLink.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Try to close the window
            window.close();
            
            // Fallback: if still open after a short delay, change the link behavior
            setTimeout(() => {
                if (!window.closed) {
                    // Try to go back in history as last resort
                    if (window.history.length > 1) {
                        window.history.back();
                    } else {
                        // If no history, just change the link to a simple close instruction
                        backLink.textContent = 'Click the X to close';
                        backLink.style.background = '#95a5a6';
                        backLink.onclick = null;
                    }
                }
            }, 100);
        });
    }
});