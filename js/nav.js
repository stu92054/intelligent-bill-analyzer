/**
 * @file nav.js
 * @description Dynamically injects a shared navigation bar into the page.
 * This allows for easy switching between different analysis pages.
 */
document.addEventListener('DOMContentLoaded', () => {
    // Create the main container for the navigation bar
    const navContainer = document.createElement('div');
    navContainer.className = 'bg-gray-800 text-white p-4 mb-8 shadow-md';

    // Determine the current page to highlight the active link
    const currentPage = window.location.pathname;
    const isIndexPage = currentPage.endsWith('/') || currentPage.endsWith('index.html');
    const isCreditCardPage = currentPage.includes('credit-card.html');
    const isBankStatementPage = currentPage.includes('bank-statement.html');
    const isSummaryPage = currentPage.includes('summary.html');

    // Set the inner HTML of the navigation bar with links
    navContainer.innerHTML = `
        <div class="container mx-auto flex justify-center gap-x-8">
            <a href="index.html" 
               class="text-lg font-semibold hover:text-indigo-400 transition-colors ${isIndexPage ? 'text-indigo-400' : ''}">
               首頁
            </a>
            <a href="summary.html" 
               class="text-lg font-semibold hover:text-indigo-400 transition-colors ${isSummaryPage ? 'text-indigo-400' : ''}">
               財務總覽
            </a>
            <a href="credit-card.html" 
               class="text-lg font-semibold hover:text-indigo-400 transition-colors ${isCreditCardPage ? 'text-indigo-400' : ''}">
               信用卡帳單
            </a>
            <a href="bank-statement.html" 
               class="text-lg font-semibold hover:text-indigo-400 transition-colors ${isBankStatementPage ? 'text-indigo-400' : ''}">
               銀行對帳單
            </a>
        </div>
    `;

    // Insert the navigation bar at the top of the body
    document.body.insertAdjacentElement('afterbegin', navContainer);
});
