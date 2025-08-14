/**
 * @file summary.js
 * @description Handles the logic for the summary page, consolidating and visualizing
 * data from both credit card and bank statement analyses.
 */

// --- Page-Specific State ---
let processedMonthlyData = {}; // Store processed data for AI access
let rawFinancialData = {}; // Store the original full data for detailed AI analysis
let chatHistory = []; // Store the conversation history with the AI

// Define getBillingMonth here as it's needed for processing
function getBillingMonth(statementDateStr, cutoffDay) {
    if (!statementDateStr || typeof statementDateStr !== 'string') {
        return "未知月份";
    }
    const date = new Date(statementDateStr.replace(/-/g, '/'));
    if (isNaN(date.getTime())) {
        return "未知月份";
    }

    if (cutoffDay && date.getDate() < cutoffDay) {
        date.setMonth(date.getMonth() - 1);
    }
    
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
}

/**
 * Main application entry point for the summary page.
 */
async function initializeSummaryApp() {
    const contentArea = document.getElementById('summary-content');
    
    try {
        const allData = await loadAnalysisData();
        rawFinancialData = allData; // Store raw data for detailed AI prompt

        if (!allData || (!allData.bankStatement && !allData.creditCard)) {
            contentArea.innerHTML = `
                <div class="bg-white p-8 rounded-lg shadow-sm text-center">
                    <h2 class="text-2xl font-bold text-gray-800 mb-4">尚無足夠資料</h2>
                    <p class="text-gray-600">請先至「信用卡帳單分析」與「銀行對帳單分析」頁面<br>上傳並分析您的帳單，才能產生財務總覽報告。</p>
                </div>
            `;
            return;
        }

        const monthlyData = processAllData(allData);
        processedMonthlyData = monthlyData; // Save for AI
        renderSummaryUI(contentArea, monthlyData);
        
        // Show and setup the AI section now that we have data
        const aiSection = document.getElementById('ai-advice-section');
        if (aiSection) {
            aiSection.classList.remove('hidden');
            setupAIAdviceGenerator();
        }

    } catch (error) {
        console.error("載入總覽資料時發生錯誤:", error);
        contentArea.innerHTML = `<div class="text-center text-red-500">載入資料時發生錯誤，請查看主控台。</div>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    runWhenReady(initializeSummaryApp);
});

/**
 * Processes the raw data from both sources and aggregates it by month.
 * @param {object} allData - The complete data object from storage.
 * @returns {object} An object containing aggregated data keyed by month.
 */
function processAllData(allData) {
    const aggregated = {};

    const ensureMonth = (month) => {
        if (!aggregated[month]) {
            aggregated[month] = {
                totalIncome: 0,
                bankSpending: 0, 
                cardSpending: 0, 
                cardSpendingByCategory: {},
                incomeByCategory: {},
                bankBalances: {},
            };
        }
    };

    if (allData.bankStatement) {
        Object.values(allData.bankStatement).forEach(bank => {
            bank.results.forEach(res => {
                const month = getBillingMonth(res.statementDate);
                ensureMonth(month);

                if (Array.isArray(res.deposits)) {
                    res.deposits.forEach(tx => {
                        aggregated[month].totalIncome += tx.amount || 0;
                        const category = tx.category || '其他';
                        aggregated[month].incomeByCategory[category] = (aggregated[month].incomeByCategory[category] || 0) + (tx.amount || 0);
                    });
                }
                if (Array.isArray(res.withdrawals)) {
                    res.withdrawals.forEach(tx => {
                        aggregated[month].bankSpending += tx.amount || 0;
                    });
                }
                
                const accountKey = `${res.bankName}-${res.accountNumber}`;
                aggregated[month].bankBalances[accountKey] = res.endingBalance || 0;
            });
        });
    }

    if (allData.creditCard) {
        const tempCutoffDay = 15;
        Object.values(allData.creditCard).forEach(card => {
            card.results.forEach(res => {
                const month = getBillingMonth(res.statementDate, tempCutoffDay);
                ensureMonth(month);

                if (Array.isArray(res.transactions)) {
                    res.transactions.forEach(tx => {
                        if (tx.amount > 0) {
                            const amount = tx.amount || 0;
                            aggregated[month].cardSpending += amount;
                            const category = tx.category || '其他';
                            aggregated[month].cardSpendingByCategory[category] = (aggregated[month].cardSpendingByCategory[category] || 0) + amount;
                        }
                    });
                }
            });
        });
    }

    return aggregated;
}

/**
 * Renders the entire summary UI, including all charts.
 * @param {HTMLElement} container - The main container to render into.
 * @param {object} monthlyData - The processed monthly data.
 */
function renderSummaryUI(container, monthlyData) {
    container.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div class="bg-white p-6 rounded-lg shadow-sm">
                <h3 class="text-xl font-bold mb-2 text-center">總收支現金流</h3>
                <div class="flex justify-around text-center mb-4 border-b pb-4">
                    <div>
                        <p class="text-sm text-gray-500">銀行總收入</p>
                        <p id="grand-total-income" class="text-2xl font-semibold text-green-600">0</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500">銀行總支出</p>
                        <p id="grand-total-spending" class="text-2xl font-semibold text-red-600">0</p>
                    </div>
                </div>
                <div class="relative h-72"><canvas id="income-expense-chart"></canvas></div>
            </div>
            <div class="bg-white p-6 rounded-lg shadow-sm">
                <h3 class="text-xl font-bold mb-2 text-center">信用卡消費類別分佈</h3>
                <div class="text-center mb-4 border-b pb-4">
                    <div>
                        <p class="text-sm text-gray-500">信用卡消費總額</p>
                        <p id="grand-total-consumption" class="text-2xl font-semibold text-red-600">0</p>
                    </div>
                </div>
                <div class="relative h-72"><canvas id="spending-category-chart"></canvas></div>
            </div>
        </div>
        <div class="bg-white p-6 rounded-lg shadow-sm">
            <h3 class="text-xl font-bold mb-2 text-center">每月財務流動與資產變化</h3>
            <div class="flex justify-around text-center mb-4 border-b pb-4 text-sm md:text-base">
                 <div>
                    <p class="text-sm text-gray-500">期間總收入</p>
                    <p id="trend-total-income" class="text-xl font-semibold text-green-600">0</p>
                </div>
                <div>
                    <p class="text-sm text-gray-500">期間銀行總支出</p>
                    <p id="trend-total-spending" class="text-xl font-semibold text-red-600">0</p>
                </div>
                <div>
                    <p class="text-sm text-gray-500">最新銀行總餘額</p>
                    <p id="latest-total-balance" class="text-xl font-semibold text-blue-600">0</p>
                </div>
            </div>
            <div class="relative h-96"><canvas id="trend-chart"></canvas></div>
        </div>
    `;

    setTimeout(() => {
        renderDoughnutCharts(monthlyData);
        renderTrendChart(monthlyData);
    }, 0);
}

/**
 * Renders the two doughnut charts and updates their total displays.
 * @param {object} monthlyData - The processed monthly data.
 */
function renderDoughnutCharts(monthlyData) {
    const grandTotal = {
        income: 0,
        bankSpending: 0,
        cardSpending: 0,
        cardSpendingByCategory: {}
    };

    Object.values(monthlyData).forEach(month => {
        grandTotal.income += month.totalIncome || 0;
        grandTotal.bankSpending += month.bankSpending || 0;
        grandTotal.cardSpending += month.cardSpending || 0;
        for (const category in month.cardSpendingByCategory) {
            grandTotal.cardSpendingByCategory[category] = (grandTotal.cardSpendingByCategory[category] || 0) + month.cardSpendingByCategory[category];
        }
    });

    document.getElementById('grand-total-income').textContent = formatCurrency(grandTotal.income);
    document.getElementById('grand-total-spending').textContent = formatCurrency(grandTotal.bankSpending);
    document.getElementById('grand-total-consumption').textContent = formatCurrency(grandTotal.cardSpending);

    const ieCtx = document.getElementById('income-expense-chart');
    if (ieCtx) {
        new Chart(ieCtx, {
            type: 'doughnut',
            data: {
                labels: ['銀行總收入', '銀行總支出'],
                datasets: [{
                    data: [grandTotal.income, grandTotal.bankSpending],
                    backgroundColor: ['#4CAF50', '#FF6384'],
                }]
            },
            options: getChartOptions(true)
        });
    }

    const scCtx = document.getElementById('spending-category-chart');
    if (scCtx) {
        const spendingLabels = Object.keys(grandTotal.cardSpendingByCategory);
        const spendingData = Object.values(grandTotal.cardSpendingByCategory);
        new Chart(scCtx, {
            type: 'doughnut',
            data: {
                labels: spendingLabels,
                datasets: [{
                    data: spendingData,
                    backgroundColor: ['#FF6384', '#FF9F40', '#FFCD56', '#4BC0C0', '#9966FF', '#F7464A', '#46BFBD', '#C9CBCF'],
                }]
            },
            options: getChartOptions(true)
        });
    }
}

/**
 * Renders the combination bar and line chart for monthly trends.
 * @param {object} monthlyData - The processed monthly data.
 */
function renderTrendChart(monthlyData) {
    const trendCtx = document.getElementById('trend-chart');
    if (!trendCtx) return;

    const sortedMonths = Object.keys(monthlyData).sort();
    
    const labels = sortedMonths;
    let latestBalances = {};
    let totalIncomeOverPeriod = 0;
    let totalBankSpendingOverPeriod = 0;

    sortedMonths.forEach(month => {
        Object.assign(latestBalances, monthlyData[month].bankBalances);
        totalIncomeOverPeriod += monthlyData[month].totalIncome || 0;
        totalBankSpendingOverPeriod += monthlyData[month].bankSpending || 0;
    });
    const latestTotalBalance = Object.values(latestBalances).reduce((sum, bal) => sum + (bal || 0), 0);

    document.getElementById('trend-total-income').textContent = formatCurrency(totalIncomeOverPeriod);
    document.getElementById('latest-total-balance').textContent = formatCurrency(latestTotalBalance);
    document.getElementById('trend-total-spending').textContent = formatCurrency(totalBankSpendingOverPeriod);

    const incomeData = sortedMonths.map(month => monthlyData[month].totalIncome || 0);
    const bankSpendingData = sortedMonths.map(month => monthlyData[month].bankSpending || 0);
    const cardSpendingData = sortedMonths.map(month => monthlyData[month].cardSpending || 0);
    const balanceData = sortedMonths.map(month => {
        let currentMonthBalance = 0;
        let tempLatestBalances = {};
        for (const m of sortedMonths) {
            if (m <= month) {
                Object.assign(tempLatestBalances, monthlyData[m].bankBalances);
            }
        }
        currentMonthBalance = Object.values(tempLatestBalances).reduce((sum, bal) => sum + (bal || 0), 0);
        return currentMonthBalance;
    });
    
    new Chart(trendCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '銀行總收入',
                    data: incomeData,
                    backgroundColor: 'rgba(76, 175, 80, 0.7)',
                },
                {
                    label: '銀行總支出',
                    data: bankSpendingData,
                    backgroundColor: 'rgba(255, 159, 64, 0.7)',
                },
                {
                    label: '信用卡總支出',
                    data: cardSpendingData,
                    backgroundColor: 'rgba(255, 99, 132, 0.7)',
                },
                {
                    type: 'line',
                    label: '銀行總餘額',
                    data: balanceData,
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.1,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    type: 'linear',
                    position: 'left',
                    title: {
                        display: true,
                        text: '金額 (TWD)'
                    },
                    beginAtZero: true
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += formatCurrency(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Reusable chart options generator.
 * @param {boolean} isDoughnut - Flag to adjust legend for doughnut charts.
 * @returns {object} A Chart.js options object.
 */
function getChartOptions(isDoughnut = false) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { 
                position: isDoughnut ? 'top' : 'bottom',
                labels: { boxWidth: 20, padding: 15 }
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        try {
                            const label = context.label || '';
                            let value = context.parsed;
                            
                            const totalAmount = context.dataset.data.reduce((a, b) => a + b, 0);

                            if (typeof value !== 'number' || isNaN(value)) {
                                return `${label}: (無效資料)`;
                            }

                            const percentage = totalAmount > 0 ? ((value / totalAmount) * 100).toFixed(2) : '0.00';
                            
                            return `${label}: ${formatCurrency(value)} (${percentage}%)`;
                        } catch (e) {
                            console.error("生成 tooltip 時發生錯誤:", e);
                            return context.label || '錯誤';
                        }
                    }
                }
            }
        }
    };
}

/**
 * Helper function to format numbers as TWD currency.
 * @param {number} amount - The number to format.
 * @returns {string} The formatted currency string.
 */
function formatCurrency(amount) {
    return (amount || 0).toLocaleString('zh-TW', { 
        style: 'currency', 
        currency: 'TWD', 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 0 
    });
}


// --- AI Advisor Functions ---

/**
 * Sets up the event listener for the AI advice generator button.
 */
function setupAIAdviceGenerator() {
    const button = document.getElementById('ai-advice-button');
    const contentDiv = document.getElementById('ai-advice-content');
    const apiKeyInput = document.getElementById('api-key-input-summary');
    const saveButton = document.getElementById('save-api-key-summary-button');
    const clearButton = document.getElementById('clear-api-key-summary-button');
    const statusP = document.getElementById('api-key-summary-status');

    if (!button || !contentDiv || !apiKeyInput || !saveButton || !clearButton || !statusP) {
        console.error("AI 建議功能的必要元件缺失。");
        return;
    }

    const loadApiKeyForSummary = () => {
        const savedKey = localStorage.getItem('geminiApiKey');
        if (savedKey) {
            apiKeyInput.value = savedKey;
            statusP.textContent = '已載入儲存的金鑰。';
            setTimeout(() => statusP.textContent = '', 3000);
        }
    };

    loadApiKeyForSummary();

    saveButton.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            localStorage.setItem('geminiApiKey', apiKey);
            statusP.textContent = '✅ 金鑰已成功儲存於您的瀏覽器。';
            setTimeout(() => statusP.textContent = '', 3000);
        }
    });

    clearButton.addEventListener('click', () => {
        localStorage.removeItem('geminiApiKey');
        apiKeyInput.value = '';
        statusP.textContent = '金鑰已清除。';
        setTimeout(() => statusP.textContent = '', 3000);
    });

    button.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            alert('請輸入您的 Gemini API 金鑰以產生建議。');
            return;
        }

        contentDiv.innerHTML = `<div class="flex justify-center items-center"><div class="spinner"></div><p class="ml-2">AI 正在分析您的財務狀況，請稍候...</p></div>`;
        button.disabled = true;

        try {
            const dataSummary = formatDataForPrompt(processedMonthlyData, rawFinancialData);
            const prompt = createAIPrompt(dataSummary);
            const adviceText = await callGeminiForAdvice(prompt, apiKey);
            
            contentDiv.innerHTML = formatAdviceResponse(adviceText);

            // Initialize chat history and show chat interface
            chatHistory = [
                { role: 'user', parts: [{ text: prompt }] },
                { role: 'model', parts: [{ text: adviceText }] }
            ];
            document.getElementById('ai-chat-interface').classList.remove('hidden');
            setupChatListener();

        } catch (error) {
            console.error("生成 AI 建議時發生錯誤:", error);
            contentDiv.innerHTML = `<p class="text-red-500 text-center">抱歉，生成建議時發生錯誤：${error.message}</p>`;
        } finally {
            button.disabled = false;
        }
    });
}

/**
 * Sets up the event listener for the chat form.
 */
function setupChatListener() {
    const chatForm = document.getElementById('ai-chat-form');
    const chatInput = document.getElementById('ai-chat-input');
    const chatSubmit = document.getElementById('ai-chat-submit');
    const apiKeyInput = document.getElementById('api-key-input-summary');

    if (!chatForm || !chatInput || !chatSubmit) return;

    // Auto-resize textarea
    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = `${chatInput.scrollHeight}px`;
    });

    // Handle Enter to submit, Shift+Enter for newline
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            chatForm.requestSubmit();
        }
    });

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userInput = chatInput.value.trim();
        if (!userInput) return;

        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            alert('請先提供 API 金鑰才能繼續對話。');
            return;
        }

        appendChatMessage(userInput, 'user');
        chatHistory.push({ role: 'user', parts: [{ text: userInput }] });
        chatInput.value = '';
        chatInput.style.height = 'auto'; // Reset height
        chatSubmit.disabled = true;

        // Add a thinking indicator
        const thinkingId = `thinking-${Date.now()}`;
        appendChatMessage('<div class="spinner"></div>', 'model', thinkingId);

        try {
            const aiResponse = await callGeminiForChat(chatHistory, apiKey);
            updateChatMessage(thinkingId, aiResponse); // Update the thinking bubble with the response
            chatHistory.push({ role: 'model', parts: [{ text: aiResponse }] });
        } catch (error) {
            console.error("AI 聊天時發生錯誤:", error);
            updateChatMessage(thinkingId, `抱歉，發生錯誤：${error.message}`);
        } finally {
            chatSubmit.disabled = false;
        }
    });
}

/**
 * Appends a new message to the chat history UI.
 * @param {string} messageContent - The HTML or text content of the message.
 * @param {string} role - 'user' or 'model'.
 * @param {string|null} elementId - An optional ID for the new element.
 */
function appendChatMessage(messageContent, role, elementId = null) {
    const historyDiv = document.getElementById('ai-chat-history');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-bubble chat-${role}`;
    if (elementId) {
        messageDiv.id = elementId;
    }

    if (role === 'user') {
        messageDiv.textContent = messageContent; // Safely set user text
    } else { // role === 'model'
        // The thinking indicator is passed as raw HTML
        if (messageContent.includes('spinner')) {
             messageDiv.innerHTML = `<div class="flex items-center justify-center p-2">${messageContent}</div>`;
        } else {
            messageDiv.innerHTML = formatAdviceResponse(messageContent);
        }
    }

    historyDiv.appendChild(messageDiv);
    historyDiv.scrollTop = historyDiv.scrollHeight; // Scroll to bottom
}

/**
 * Updates an existing chat message, used for replacing the "thinking" indicator.
 * @param {string} elementId - The ID of the element to update.
 * @param {string} newHtml - The new HTML content.
 */
function updateChatMessage(elementId, newHtml) {
    const messageDiv = document.getElementById(elementId);
    if (messageDiv) {
        messageDiv.innerHTML = formatAdviceResponse(newHtml);
        const historyDiv = document.getElementById('ai-chat-history');
        historyDiv.scrollTop = historyDiv.scrollHeight;
    }
}


/**
 * Formats the monthly data and raw transaction lists into a string for the AI prompt.
 * @param {object} data - The processed monthly data.
 * @param {object} allRawData - The original, unprocessed data from storage.
 * @returns {string} A summarized string of financial data including transaction details.
 */
function formatDataForPrompt(data, allRawData) {
    let summary = "這是一份多個月的財務摘要：\n\n";
    const sortedMonths = Object.keys(data).sort();

    for (const month of sortedMonths) {
        const monthData = data[month];
        summary += `--- 月份: ${month} ---\n`;
        summary += `總收入: ${formatCurrency(monthData.totalIncome)}\n`;
        summary += `銀行總支出: ${formatCurrency(monthData.bankSpending)}\n`;
        summary += `信用卡總支出 (僅供消費習慣分析): ${formatCurrency(monthData.cardSpending)}\n`;
        summary += `  - 信用卡消費分類: ${JSON.stringify(monthData.cardSpendingByCategory)}\n`;
        summary += `當月淨現金流 (收入 - 銀行支出): ${formatCurrency(monthData.totalIncome - monthData.bankSpending)}\n\n`;
    }

    summary += "\n\n--- 交易明細清單 (用於深入分析) ---\n\n";

    if (allRawData && allRawData.bankStatement) {
        summary += "### 銀行收支明細\n";
        Object.values(allRawData.bankStatement).forEach(bank => {
            bank.results.forEach(res => {
                summary += `**${res.bankName || '未知銀行'} (${res.statementDate || '無日期'})**\n`;
                if (res.deposits && res.deposits.length > 0) {
                    summary += "存入:\n";
                    res.deposits.forEach(tx => {
                        summary += `  - ${tx.date || '無日期'}: ${tx.description || ''} - ${formatCurrency(tx.amount)}\n`;
                    });
                }
                if (res.withdrawals && res.withdrawals.length > 0) {
                    summary += "支出:\n";
                    res.withdrawals.forEach(tx => {
                        summary += `  - ${tx.date || '無日期'}: ${tx.description || ''} - ${formatCurrency(tx.amount)}\n`;
                    });
                }
                summary += "\n";
            });
        });
    }

    if (allRawData && allRawData.creditCard) {
        summary += "### 信用卡消費明細\n";
        Object.values(allRawData.creditCard).forEach(card => {
            card.results.forEach(res => {
                summary += `**${res.bankName || '未知銀行'} (${res.statementDate || '無日期'})**\n`;
                if (res.transactions && res.transactions.length > 0) {
                    res.transactions.forEach(tx => {
                        summary += `  - ${tx.date || '無日期'}: ${tx.description || ''} (${tx.category || '未分類'}) - ${formatCurrency(tx.amount)}\n`;
                    });
                }
                 summary += "\n";
            });
        });
    }

    return summary;
}

/**
 * Creates the full prompt for the Gemini API.
 * @param {string} dataSummary - The formatted financial data summary.
 * @returns {string} The complete prompt.
 */
function createAIPrompt(dataSummary) {
    return `
# 角色：專業理財顧問

# 任務：
你是一位經驗豐富的理財顧問。請根據我提供的以下**財務摘要**以及**詳細的交易清單**，為我提供一份專業、客觀、且個人化的理財建議。你的建議應該要具體、務實，並以友善鼓勵的語氣呈現。

# 分析依據的財務資料：
\`\`\`
${dataSummary}
\`\`\`

# 建議應包含以下幾個面向：
1.  **總體財務狀況分析**：根據摘要，簡要總結我的收支狀況與現金流。
2.  **消費習慣點評**：**深入分析詳細的交易清單**，找出具體的、高頻率或高金額的消費項目。點評我的消費習慣，例如是否過度集中在'餐飲美食'或'休閒娛樂'。
3.  **潛在問題與風險**：根據摘要與交易清單，點出任何潛在的財務風險。例如：是否有不必要的訂閱服務？是否有大額的單筆非必要支出？
4.  **具體行動建議**：提供 3-5 條最重要且可行的具體建議。**你的建議應該要基於交易清單中的實際項目**。例如：
    * "注意到您在 [某月份] 有多筆 [店家名稱] 的消費，總計 [金額]。建議您可以考慮..."
    * "您的'餐飲美食'類別支出較高，其中 [具體交易] 佔了不小的比例。建議..."
    * "您有一筆來自 [交易描述] 的穩定收入，這很棒！考慮將這筆收入..."
5.  **總結與鼓勵**：用一段話總結，並給予正向的鼓勵。

# 輸出格式要求：
* 請使用繁體中文。
* 請使用清晰的標題來區分各個建議面向。
* 在「具體行動建議」部分，請使用項目符號（例如星號 *）來條列說明。
* 整體語氣應專業且有同理心，避免使用過於嚴厲或批評的字眼。
`;
}

/**
 * Calls the Gemini API for the initial advice.
 * @param {string} prompt - The prompt to send to the API.
 * @param {string} apiKey - The user's API key.
 * @returns {Promise<string>} A promise that resolves to the AI's text response.
 */
async function callGeminiForAdvice(prompt, apiKey) {
    const model = 'gemini-2.5-flash-preview-05-20';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const payload = {
        contents: [{
            parts: [{ text: prompt }]
        }]
    };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API 請求失敗: ${errorData.error.message}`);
    }

    const result = await response.json();
    if (result.candidates && result.candidates.length > 0) {
        return result.candidates[0].content.parts[0].text;
    } else {
        throw new Error('AI 未回傳有效的建議內容。');
    }
}

/**
 * Calls the Gemini API for follow-up chat conversation.
 * @param {Array} history - The entire conversation history.
 * @param {string} apiKey - The user's API key.
 * @returns {Promise<string>} A promise that resolves to the AI's text response.
 */
async function callGeminiForChat(history, apiKey) {
    const model = 'gemini-2.5-flash-preview-05-20';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const payload = {
        contents: history
    };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API 請求失敗: ${errorData.error.message}`);
    }

    const result = await response.json();
     if (result.candidates && result.candidates.length > 0) {
        return result.candidates[0].content.parts[0].text;
    } else {
        console.error("Full API response on chat failure:", result);
        throw new Error('AI 未回傳有效的聊天回應。');
    }
}


/**
 * Formats the plain text response from the AI into simple HTML.
 * @param {string} text - The text from the AI.
 * @returns {string} HTML formatted string.
 */
function formatAdviceResponse(text) {
    // Prevent rendering of raw HTML from the AI
    let sanitizedText = text
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    let html = sanitizedText
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
        .replace(/# (.*?)(<br>|$)/g, '<h3 class="text-lg font-bold mt-4 mb-2">$1</h3>') // H3
        .replace(/\* (.*?)(<br>|$)/g, '<li class="ml-5 list-disc">$1</li>'); // List items

    // Wrap list items in a <ul>
    if (html.includes('<li')) {
        html = html.replace(/<li/g, '<ul><li').replace(/<\/li>(?!<li)/g, '</li></ul>');
        // Fix for multiple lists
        html = html.replace(/<\/ul><br><ul>/g, '');
    }
    
    return `<div class="text-left">${html}</div>`;
}
