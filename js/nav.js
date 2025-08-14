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

    // IMPORTANT: Please replace this with your actual GitHub repository URL
    const githubRepoUrl = "https://github.com/stu92054/intelligent-bill-analyzer";

    // Set the inner HTML of the navigation bar with links
    navContainer.innerHTML = `
        <div class="container mx-auto flex justify-center items-center gap-x-8">
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
            <a href="${githubRepoUrl}" target="_blank" rel="noopener noreferrer"
               class="text-lg font-semibold hover:text-indigo-400 transition-colors flex items-center gap-x-2">
                <!-- GitHub Icon SVG -->
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" class="bi bi-github" viewBox="0 0 16 16">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"/>
                </svg>
                查看源碼
            </a>
        </div>
    `;

    // Insert the navigation bar at the top of the body
    document.body.insertAdjacentElement('afterbegin', navContainer);
});
