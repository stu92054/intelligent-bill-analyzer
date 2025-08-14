/**
 * @file bank-statement.js
 * @description Contains all logic for the Bank Statement Analysis page.
 */

// --- Page-Specific State ---
let activeCharts = {};
let monthlyAndBankGroupedData = {}; 

// --- Prompt Generation ---

function getBankStatementPrompt(hash) {
    return `# 類型：銀行帳戶對帳單分析
# 角色：金融數據分析專家

你是一位精通處理金融數據的 AI 專家。你的任務是從我提供的銀行帳戶對帳單內容中，提取所有交易紀錄，並根據資金流向將其分類至 withdrawals（支出）或 deposits（存入）兩個獨立的陣列中。

---
## 任務目標

分析提供的銀行帳戶對帳單內容，並嚴格按照指定的雙陣列 JSON 結構輸出。

---
## 輸出要求

1.  **最終輸出必須是單一的、格式正確的 JSON 物件。**
2.  **不要在 JSON 物件前後添加任何說明、註解或 \`\`\`json ... \`\`\` 標記。**
3.  **交易分類邏輯 (Withdrawal-Deposit Sorting Logic):**
    * **支出/提款/轉出** 的項目應放入根物件的 \`withdrawals\` 陣列中。
    * **存入/轉入/利息** 的項目應放入根物件的 \`deposits\` 陣列中。
4.  **\`withdrawals\` 物件**應包含以下欄位：
    * \`date\`, \`description\`, \`amount\` (應為正數), \`category\`
5.  **\`deposits\` 物件**應包含以下欄位：
    * \`date\`, \`description\`, \`amount\`, \`category\`
6.  **消費分類 (\`category\`)：** 請對 \`withdrawals\` 和 \`deposits\` 陣列中的項目進行分類。
    * **支出分類列表**: \`餐飲美食\`, \`交通出行\`, \`購物消費\`, \`居家生活\`, \`休閒娛樂\`, \`醫療保健\`, \`帳單繳費\`, \`現金提款\`, \`轉帳支出\`, \`其他\`
    * **存入分類列表**: \`薪資入帳\`, \`他人轉入\`, \`現金存入\`, \`帳戶利息\`, \`投資收益\`, \`其他\`

---
## JSON 輸出格式範本

\`\`\`json
{
  "bankName": "銀行名稱",
  "billHash": "${hash}",
  "accountName": "帳戶名稱 (可為 null)",
  "accountNumber": "帳號 (末五碼即可)",
  "statementDate": "YYYY-MM-DD",
  "statementPeriod": {
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD"
  },
  "endingBalance": 0,
  "withdrawals": [],
  "deposits": []
}
\`\`\``;
}

// --- Core Application Logic ---

function handleFiles(files) {
    if (files.length === 0) return;
    
    for (const file of files) {
        if (file.type === 'application/pdf') {
            const fileId = `file-${crypto.randomUUID()}`;
            fileQueue.push({ id: fileId, file: file, status: 'pending', result: null, hash: null });
        }
    }
    renderFileQueue();
    dom.part2.classList.remove('hidden');
}

async function processQueue() {
    const apiKey = dom.apiKeyInput.value;
    if (!apiKey) {
        alert('請先輸入您的 Gemini API 金鑰。');
        return;
    }
    
    dom.batchAnalyzeButton.disabled = true;
    dom.batchAnalyzeButton.textContent = '分析中...';
    dom.batchAnalyzeButton.classList.replace('bg-green-600', 'bg-gray-500');

    for (const item of fileQueue) {
        if (item.status !== 'pending') continue;
        try {
            item.status = 'processing';
            renderFileQueue();
            const fileData = await readFileAsArrayBuffer(item.file);
            
            const { apiParts, hash } = await prepareApiPayload(fileData, item.file.name, getBankStatementPrompt);
            item.apiParts = apiParts;
            item.hash = hash;

            const loadedItem = fileQueue.find(i => i.loadedFromLocal && i.hash === item.hash);
            if (loadedItem) {
                 item.result = loadedItem.result;
                 item.status = 'success';
                 item.loadedFromLocal = true;
            }
        } catch (error) {
            console.error(`預處理檔案 ${item.file.name} 失敗:`, error);
            item.status = 'error';
        }
    }
    renderFileQueue();

    const analysisPromises = fileQueue.map(async (item) => {
        if (item.status !== 'processing' || !item.apiParts) return item;
        try {
            const selectedModel = dom.modelSelect.value;
            const resultJson = await analyzeWithGemini(item.apiParts, apiKey, item.hash, selectedModel);
            item.status = 'success';
            item.result = resultJson;
        } catch (error) {
            console.error(`分析檔案 ${item.file.name} 失敗:`, error);
            item.status = 'error';
        } finally {
            delete item.apiParts;
        }
        return item;
    });

    await Promise.allSettled(analysisPromises);
    
    renderFileQueue();
    renderAggregatedResults();
    
    dom.batchAnalyzeButton.disabled = false;
    dom.batchAnalyzeButton.textContent = '🚀 開始分析';
    dom.batchAnalyzeButton.classList.replace('bg-gray-500', 'bg-green-600');
}


// --- Data Loading and Saving ---

function processLoadedData(data) {
    if (!data || typeof data !== 'object') {
        console.log("無有效的銀行對帳單資料可載入。");
        return;
    }
    
    fileQueue = [];
    
    Object.values(data).forEach(bankData => {
        if (Array.isArray(bankData.results)) {
            bankData.results.forEach(res => {
                const fileId = `file-loaded-${res.billHash || crypto.randomUUID()}`;
                fileQueue.push({
                    id: fileId,
                    file: { name: `來自存檔: ${res.bankName || '未知'} (${res.accountNumber || '無帳號'})`},
                    status: 'success',
                    result: res,
                    hash: res.billHash,
                    loadedFromLocal: true
                });
            });
        }
    });

    dom.loadStatus.textContent = `✅ 已成功載入 ${fileQueue.length} 筆銀行對帳單紀錄。`;
    dom.loadStatus.classList.remove('hidden');
    
    renderFileQueue();
    renderAggregatedResults();
    if (fileQueue.length > 0) {
        dom.part2.classList.remove('hidden');
    }
}

async function handleLoadFile(file) {
    try {
        const fullData = await loadAnalysisData(file);
        processLoadedData(fullData ? fullData.bankStatement : null);
    } catch (error) {
        alert(error.message);
        dom.loadStatus.classList.add('hidden');
    }
}

async function autoLoadSavedData() {
    try {
        const fullData = await loadAnalysisData();
        processLoadedData(fullData ? fullData.bankStatement : null);
    } catch (error) {
        console.error("自動載入失敗:", error);
    }
}


// --- UI Rendering and Event Handling ---

function getBillingMonth(statementDateStr) {
    if (!statementDateStr || typeof statementDateStr !== 'string') {
        return "未知月份";
    }
    const date = new Date(statementDateStr.replace(/-/g, '/'));
    if (isNaN(date.getTime())) {
        return "未知月份";
    }
    
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
}

function renderAggregatedResults() {
    const successfulResults = fileQueue.filter(item => item.status === 'success' && item.result);
    dom.saveButton.disabled = successfulResults.length === 0;
    
    monthlyAndBankGroupedData = {};

    const monthlyGroups = successfulResults.reduce((acc, item) => {
        const billingMonth = getBillingMonth(item.result.statementDate);
        if (!acc[billingMonth]) {
            acc[billingMonth] = [];
        }
        acc[billingMonth].push(item);
        return acc;
    }, {});

    Object.values(activeCharts).forEach(monthCharts => {
        if(monthCharts.withdrawal) monthCharts.withdrawal.destroy();
        if(monthCharts.deposit) monthCharts.deposit.destroy();
    });
    activeCharts = {};
    
    dom.aggregatedResultsContainer.innerHTML = '';
    
    const sortedMonths = Object.keys(monthlyGroups).sort().reverse();

    if (sortedMonths.length > 0) {
        sortedMonths.forEach(month => {
            const monthSection = document.createElement('section');
            monthSection.className = 'month-section';
            monthSection.dataset.month = month;
            dom.aggregatedResultsContainer.appendChild(monthSection);
            
            populateAndRenderMonth(monthSection, month, monthlyGroups[month]);
        });
        dom.part3.classList.remove('hidden');
    } else {
        dom.part3.classList.add('hidden');
    }

    renderTotalBalanceFooter();
}

function populateAndRenderMonth(monthSection, month, items) {
    monthSection.innerHTML = `<h3 class="text-2xl font-bold mb-4 border-b pb-2">對帳單月份：${month}</h3>`;

    const contentGrid = document.createElement('div');
    contentGrid.className = 'grid lg:grid-cols-3 gap-8';
    
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'lg:col-span-2 space-y-6';

    const bankGroups = items.reduce((acc, item) => {
        const bankName = item.result.bankName || '未知銀行';
        if (!acc[bankName]) {
            acc[bankName] = { 
                deposits: [], 
                withdrawals: [],
                endingBalance: 0,
                count: 0,
                dpSortState: { key: 'date', direction: 'asc' },
                wdSortState: { key: 'date', direction: 'asc' }
            };
        }
        if(Array.isArray(item.result.deposits)) acc[bankName].deposits.push(...item.result.deposits.map((tx, i) => ({...tx, originalIndex: `${item.id}_d_${i}`})));
        if(Array.isArray(item.result.withdrawals)) acc[bankName].withdrawals.push(...item.result.withdrawals.map((tx, i) => ({...tx, originalIndex: `${item.id}_w_${i}`})));
        acc[bankName].endingBalance += item.result.endingBalance || 0;
        acc[bankName].count++;
        return acc;
    }, {});

    monthlyAndBankGroupedData[month] = bankGroups;

    for (const bankName in bankGroups) {
        const card = createResultCard(bankName, bankGroups[bankName], month);
        cardsContainer.appendChild(card);
        updateSubtotals(card, bankGroups[bankName]);
    }
    
    contentGrid.appendChild(cardsContainer);
    
    const monthlyChartData = {
        withdrawal: { total: 0, categories: {} },
        deposit: { total: 0, categories: {} }
    };

    items.forEach(item => {
        if (item.result && Array.isArray(item.result.withdrawals)) {
            item.result.withdrawals.forEach(tx => {
                if (tx.amount > 0) {
                    monthlyChartData.withdrawal.total += tx.amount;
                    const category = tx.category || '其他';
                    monthlyChartData.withdrawal.categories[category] = (monthlyChartData.withdrawal.categories[category] || 0) + tx.amount;
                }
            });
        }
        if (item.result && Array.isArray(item.result.deposits)) {
            item.result.deposits.forEach(tx => {
                if (tx.amount > 0) {
                    monthlyChartData.deposit.total += tx.amount;
                    const category = tx.category || '其他';
                    monthlyChartData.deposit.categories[category] = (monthlyChartData.deposit.categories[category] || 0) + tx.amount;
                }
            });
        }
    });

    const chartContainer = createMonthlyChartContainer(month);
    contentGrid.appendChild(chartContainer);
    monthSection.appendChild(contentGrid);

    setTimeout(() => renderMonthlyCharts(month, monthlyChartData), 0);
}


function createResultCard(bankName, data, month) {
    const card = document.createElement('div');
    card.className = 'bg-white p-6 rounded-lg shadow-sm space-y-6';
    card.dataset.bankName = bankName;
    card.dataset.month = month;

    const totalDeposits = data.deposits.reduce((sum, item) => sum + (item.amount || 0), 0);
    const totalWithdrawals = data.withdrawals.reduce((sum, item) => sum + (item.amount || 0), 0);

    card.innerHTML = `
        <div>
            <h4 class="text-xl font-bold mb-2">${bankName}</h4>
            <div class="grid grid-cols-3 gap-4 mb-4 text-center">
                <div><p class="text-sm text-gray-500">總存入</p><p class="text-lg font-semibold text-green-600">${totalDeposits.toLocaleString()}</p></div>
                <div><p class="text-sm text-gray-500">總支出</p><p class="text-lg font-semibold text-red-600">${totalWithdrawals.toLocaleString()}</p></div>
                <div><p class="text-sm text-gray-500">期末餘額</p><p class="text-lg font-semibold">${data.endingBalance.toLocaleString()}</p></div>
            </div>
        </div>
    `;
    
    const dpContainer = document.createElement('div');
    dpContainer.innerHTML = `<h5 class="text-lg font-semibold mb-2 border-b pb-1">存入明細</h5>`;
    const dpTable = createTable(['日期', '說明', '分類', '金額', '操作'], ['date', 'description', 'category', 'amount', 'actions'], 'deposits');
    dpContainer.appendChild(dpTable);
    card.appendChild(dpContainer);
    renderTableRows(dpTable.querySelector('tbody'), data.deposits, 'deposits');

    const wdContainer = document.createElement('div');
    wdContainer.innerHTML = `<h5 class="text-lg font-semibold mb-2 mt-6 border-b pb-1">支出明細</h5>`;
    const wdTable = createTable(['日期', '說明', '分類', '金額', '操作'], ['date', 'description', 'category', 'amount', 'actions'], 'withdrawals');
    wdContainer.appendChild(wdTable);
    card.appendChild(wdContainer);
    renderTableRows(wdTable.querySelector('tbody'), data.withdrawals, 'withdrawals');
    
    addCardEventListeners(card);
    return card;
}

function createTable(headers, keys, tableType) {
    const table = document.createElement('table');
    table.className = 'w-full text-sm';
    table.dataset.tableType = tableType;
    const thead = document.createElement('thead');
    thead.className = 'bg-gray-50';
    let headerHtml = '<tr>';
    headers.forEach((h, i) => {
        headerHtml += `<th class="py-2 px-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sortable-header" data-sort-by="${keys[i]}">${h}</th>`;
    });
    headerHtml += '</tr>';
    thead.innerHTML = headerHtml;
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    tbody.className = 'divide-y divide-gray-200';
    table.appendChild(tbody);
    const tfoot = document.createElement('tfoot');
    tfoot.className = 'bg-gray-100 font-bold';
    table.appendChild(tfoot);
    return table;
}

function renderTableRows(tbody, items, type) {
    tbody.innerHTML = '';
    const colSpan = 5;
    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colSpan}" class="text-center py-4 text-gray-500">無紀錄</td></tr>`;
        return;
    }
    items.forEach((item) => {
        const row = document.createElement('tr');
        row.className = 'border-b hover:bg-gray-50';
        const amountColor = type === 'deposits' ? 'text-green-600' : 'text-red-600';
        
        row.innerHTML = `
            <td class="py-2 px-3" contenteditable="true" data-index="${item.originalIndex}" data-field="date">${item.date || ''}</td>
            <td class="py-2 px-3" contenteditable="true" data-index="${item.originalIndex}" data-field="description">${item.description || ''}</td>
            <td class="py-2 px-3" contenteditable="true" data-index="${item.originalIndex}" data-field="category">${item.category || '其他'}</td>
            <td class="py-2 px-3 text-right font-medium ${amountColor}" contenteditable="true" data-index="${item.originalIndex}" data-field="amount">${(item.amount || 0).toLocaleString()}</td>
            <td class="py-2 px-3 text-center"><button class="delete-row-btn text-gray-400 hover:text-red-600" data-index="${item.originalIndex}">🗑️</button></td>
        `;
        tbody.appendChild(row);
    });
}

function updateSubtotals(cardElement, bankData) {
    const totalDeposits = bankData.deposits.reduce((sum, item) => sum + (item.amount || 0), 0);
    const totalWithdrawals = bankData.withdrawals.reduce((sum, item) => sum + (item.amount || 0), 0);

    const dpTable = cardElement.querySelector('table[data-table-type="deposits"]');
    if (dpTable) {
        let tfoot = dpTable.querySelector('tfoot');
        tfoot.innerHTML = `<tr><td colspan="4" class="py-2 px-3 text-right font-bold">存入小計</td><td class="py-2 px-3 text-right font-bold text-green-600">${totalDeposits.toLocaleString()}</td></tr>
                         <tr><td colspan="5" class="text-center py-1"><button class="add-row-btn text-indigo-600 hover:text-indigo-800 text-sm font-bold" data-table-type="deposits">➕ 新增</button></td></tr>`;
    }

    const wdTable = cardElement.querySelector('table[data-table-type="withdrawals"]');
    if (wdTable) {
        let tfoot = wdTable.querySelector('tfoot');
        tfoot.innerHTML = `<tr><td colspan="4" class="py-2 px-3 text-right font-bold">支出小計</td><td class="py-2 px-3 text-right font-bold text-red-600">${totalWithdrawals.toLocaleString()}</td></tr>
                         <tr><td colspan="5" class="text-center py-1"><button class="add-row-btn text-indigo-600 hover:text-indigo-800 text-sm font-bold" data-table-type="withdrawals">➕ 新增</button></td></tr>`;
    }
}

function createMonthlyChartContainer(month) {
    const container = document.createElement('div');
    container.className = 'lg:col-span-1';
    
    const wrapper = document.createElement('div');
    wrapper.className = 'bg-white p-6 rounded-lg shadow-sm space-y-6';
    
    const withdrawalSection = document.createElement('div');
    withdrawalSection.innerHTML = `
        <p class="text-lg text-gray-600 text-center">該月總支出</p>
        <p id="total-spending-${month}" class="text-3xl font-bold text-red-600 text-center mb-2">0</p>
    `;
    const withdrawalCanvasContainer = document.createElement('div');
    withdrawalCanvasContainer.className = 'relative h-64';
    const withdrawalCanvas = document.createElement('canvas');
    withdrawalCanvas.id = `withdrawal-chart-${month}`;
    withdrawalCanvasContainer.appendChild(withdrawalCanvas);
    withdrawalSection.appendChild(withdrawalCanvasContainer);
    
    const depositSection = document.createElement('div');
    depositSection.innerHTML = `
        <p class="text-lg text-gray-600 text-center mt-4">該月總存入</p>
        <p id="total-deposits-${month}" class="text-3xl font-bold text-green-600 text-center mb-2">0</p>
    `;
    const depositCanvasContainer = document.createElement('div');
    depositCanvasContainer.className = 'relative h-64';
    const depositCanvas = document.createElement('canvas');
    depositCanvas.id = `deposit-chart-${month}`;
    depositCanvasContainer.appendChild(depositCanvas);
    depositSection.appendChild(depositCanvasContainer);

    wrapper.appendChild(withdrawalSection);
    wrapper.appendChild(depositSection);
    
    container.appendChild(wrapper);
    return container;
}

function renderMonthlyCharts(month, chartData) {
    const withdrawalCanvas = document.getElementById(`withdrawal-chart-${month}`);
    const depositCanvas = document.getElementById(`deposit-chart-${month}`);
    const totalSpendingEl = document.getElementById(`total-spending-${month}`);
    const totalDepositsEl = document.getElementById(`total-deposits-${month}`);

    if (!withdrawalCanvas || !depositCanvas || !totalSpendingEl || !totalDepositsEl) {
        console.error(`無法為月份 ${month} 找到圖表或總額的 DOM 元素。`);
        return;
    }

    if (activeCharts[month]) {
        if(activeCharts[month].withdrawal) activeCharts[month].withdrawal.destroy();
        if(activeCharts[month].deposit) activeCharts[month].deposit.destroy();
    }
    activeCharts[month] = {};

    const withdrawalColors = ['#FF6384', '#FF9F40', '#FFCD56', '#4BC0C0', '#F7464A', '#9966FF', '#C9CBCF', '#4D5360'];
    const depositColors = ['#4CAF50', '#8BC34A', '#CDDC39', '#009688', '#00BCD4', '#673AB7'];

    totalSpendingEl.textContent = `NT$ ${chartData.withdrawal.total.toLocaleString()}`;
    const withdrawalLabels = Object.keys(chartData.withdrawal.categories);
    if (withdrawalLabels.length > 0) {
        activeCharts[month].withdrawal = new Chart(withdrawalCanvas, {
            type: 'doughnut',
            data: {
                labels: withdrawalLabels,
                datasets: [{
                    label: '支出金額',
                    data: Object.values(chartData.withdrawal.categories),
                    backgroundColor: withdrawalColors,
                    hoverOffset: 4
                }]
            },
            options: getChartOptions(chartData.withdrawal.total)
        });
    }

    totalDepositsEl.textContent = `NT$ ${chartData.deposit.total.toLocaleString()}`;
    const depositLabels = Object.keys(chartData.deposit.categories);
    if (depositLabels.length > 0) {
        activeCharts[month].deposit = new Chart(depositCanvas, {
            type: 'doughnut',
            data: {
                labels: depositLabels,
                datasets: [{
                    label: '存入金額',
                    data: Object.values(chartData.deposit.categories),
                    backgroundColor: depositColors,
                    hoverOffset: 4
                }]
            },
            options: getChartOptions(chartData.deposit.total)
        });
    }
}

function getChartOptions(totalAmount) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { 
                position: 'top',
                labels: { boxWidth: 20, padding: 15 }
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        try {
                            const label = context.label || '';
                            let value = context.parsed;

                            if (typeof value !== 'number' || isNaN(value)) {
                                return `${label}: (無效資料)`;
                            }

                            const percentage = totalAmount > 0 ? ((value / totalAmount) * 100).toFixed(2) : '0.00';
                            
                            const formattedValue = value.toLocaleString('zh-TW', { 
                                style: 'currency', 
                                currency: 'TWD', 
                                minimumFractionDigits: 0, 
                                maximumFractionDigits: 0 
                            });

                            return `${label}: ${formattedValue} (${percentage}%)`;
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

function addCardEventListeners(card) {
    card.addEventListener('click', (e) => {
        if (e.target.matches('.sortable-header')) {
            const bankName = e.target.closest('[data-bank-name]').dataset.bankName;
            const month = e.target.closest('[data-month]').dataset.month;
            const tableType = e.target.closest('table').dataset.tableType;
            const sortBy = e.target.dataset.sortBy;
            handleSort(month, bankName, tableType, sortBy);
        } else if (e.target.matches('.delete-row-btn')) {
            const index = e.target.dataset.index;
            const tableType = e.target.closest('table').dataset.tableType;
            
            const [fileId, type, itemIndexStr] = index.split('_');
            const itemIndex = parseInt(itemIndexStr, 10);
            const fileItem = fileQueue.find(i => i.id === fileId);

            if (fileItem && fileItem.result && fileItem.result[tableType]) {
                fileItem.result[tableType].splice(itemIndex, 1);
                renderAggregatedResults();
            }
        } else if (e.target.matches('.add-row-btn')) {
            const bankName = e.target.closest('[data-bank-name]').dataset.bankName;
            const month = e.target.closest('[data-month]').dataset.month;
            const tableType = e.target.closest('table').dataset.tableType;
            
            let manualFileItem = fileQueue.find(item => item.id === `manual-${month}-${bankName}`);
            if (!manualFileItem) {
                const dateForMonth = month + '-01';
                manualFileItem = {
                    id: `manual-${month}-${bankName}`,
                    file: { name: `手動新增 - ${bankName} (${month})`},
                    status: 'success',
                    result: {
                        bankName: bankName,
                        statementDate: dateForMonth,
                        deposits: [],
                        withdrawals: []
                    },
                    loadedFromLocal: true
                };
                fileQueue.push(manualFileItem);
            }

            const newEntry = { date: '', description: '手動新增', amount: 0, category: '其他' };
            manualFileItem.result[tableType].push(newEntry);
            renderAggregatedResults();
        }
    });

    card.addEventListener('blur', (e) => {
        if (e.target.matches('[contenteditable="true"]')) {
            const tableType = e.target.closest('table').dataset.tableType;
            const index = e.target.dataset.index;
            const field = e.target.dataset.field;
            let value = e.target.textContent;

            const [fileId, type, itemIndexStr] = index.split('_');
            const itemIndex = parseInt(itemIndexStr, 10);
            const fileItem = fileQueue.find(i => i.id === fileId);
            
            if (!fileItem || !fileItem.result || !fileItem.result[tableType] || !fileItem.result[tableType][itemIndex]) return;

            const originalItem = fileItem.result[tableType][itemIndex];

            if (field === 'amount') {
                const parsedValue = parseFloat(value.replace(/,/g, ''));
                originalItem[field] = isNaN(parsedValue) ? 0 : parsedValue;
                e.target.textContent = originalItem[field].toLocaleString();
            } else {
                originalItem[field] = value;
            }
            renderAggregatedResults();
        }
    }, true);
}

function handleSort(month, bankName, tableType, sortBy) {
    const data = monthlyAndBankGroupedData[month][bankName];
    const sortState = tableType === 'deposits' ? data.dpSortState : data.wdSortState;

    if (sortState.key === sortBy) {
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        sortState.key = sortBy;
        sortState.direction = 'asc';
    }

    data[tableType].sort((a, b) => {
        let valA = a[sortBy];
        let valB = b[sortBy];

        if (sortBy === 'date') {
            valA = new Date(valA || 0);
            valB = new Date(valB || 0);
        } else if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = (valB || '').toLowerCase();
        } else {
            valA = (valA === null || isNaN(valA)) ? -Infinity : valA;
            valB = (valB === null || isNaN(valB)) ? -Infinity : valB;
        }

        let comparison = 0;
        if (valA > valB) comparison = 1;
        else if (valA < valB) comparison = -1;
        
        return sortState.direction === 'asc' ? comparison : -comparison;
    });
    
    const tableElement = document.querySelector(`[data-month="${month}"] [data-bank-name="${bankName}"] table[data-table-type="${tableType}"]`);
    if (tableElement) {
        renderTableRows(tableElement.querySelector('tbody'), data[tableType], tableType);

        tableElement.querySelectorAll('.sortable-header').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
        });
        const activeHeader = tableElement.querySelector(`[data-sort-by="${sortBy}"]`);
        activeHeader.classList.add(sortState.direction === 'asc' ? 'sort-asc' : 'sort-desc');
    }
}

function renderTotalBalanceFooter() {
    let footer = document.getElementById('total-balance-footer');
    if (!footer) {
        footer = document.createElement('footer');
        footer.id = 'total-balance-footer';
        footer.className = 'fixed bottom-0 left-0 right-0 bg-gray-800 text-white p-4 text-center shadow-lg z-10';
        document.body.appendChild(footer);
    }

    const successfulResults = fileQueue.filter(item => item.status === 'success' && item.result);

    if (successfulResults.length === 0) {
        footer.innerHTML = `<p class="text-lg font-semibold">請先上傳並分析您的銀行對帳單</p>`;
        return;
    }

    const latestStatements = {};
    successfulResults.forEach(item => {
        const accountKey = `${item.result.bankName}-${item.result.accountNumber}`;
        const currentStatementDate = new Date(item.result.statementDate);

        if (!latestStatements[accountKey] || currentStatementDate > new Date(latestStatements[accountKey].result.statementDate)) {
            latestStatements[accountKey] = item;
        }
    });

    const totalBalance = Object.values(latestStatements).reduce((sum, item) => {
        return sum + (item.result.endingBalance || 0);
    }, 0);

    const formattedTotal = totalBalance.toLocaleString('zh-TW', {
        style: 'currency',
        currency: 'TWD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });

    footer.innerHTML = `<p class="text-lg font-semibold">當前銀行總餘額：<span class="text-green-400 text-xl">${formattedTotal}</span></p>`;
}


// --- Initializers and Event Listeners Setup ---

/**
 * Main application entry point.
 * Initializes DOM elements and sets up all event listeners.
 */
function initializeApp() {
    initializeDOMElements();

    document.title = "智慧對帳單分析儀 (銀行)";
    const mainHeader = document.querySelector('h1');
    if(mainHeader) mainHeader.textContent = "智慧對帳單分析儀";
    const subHeader = document.querySelector('p.text-lg');
    if(subHeader) subHeader.textContent = "上傳您的銀行對帳單進行分析";
    
    if(dom.cutoffDayInput) {
        dom.cutoffDayInput.parentElement.parentElement.style.display = 'none';
    }
    
    loadApiKey();
    renderPasswordPresets();
    autoLoadSavedData();

    dom.saveApiKeyButton.addEventListener('click', () => {
        const apiKey = dom.apiKeyInput.value;
        if (apiKey) {
            localStorage.setItem('geminiApiKey', apiKey);
            dom.apiKeyStatus.textContent = '✅ 金鑰已儲存於您的瀏覽器。';
            setTimeout(() => dom.apiKeyStatus.textContent = '', 3000);
        }
    });

    dom.clearApiKeyButton.addEventListener('click', () => {
        localStorage.removeItem('geminiApiKey');
        dom.apiKeyInput.value = '';
        dom.apiKeyStatus.textContent = '金鑰已清除。';
        setTimeout(() => dom.apiKeyStatus.textContent = '', 3000);
    });
    
    dom.addPasswordPresetButton.addEventListener('click', () => {
        const newPassword = dom.passwordPresetInput.value.trim();
        if (newPassword) {
            let presets = getPasswordPresets();
            if (!presets.includes(newPassword)) {
                presets.push(newPassword);
                savePasswordPresets(presets);
                renderPasswordPresets();
            }
            dom.passwordPresetInput.value = '';
        }
    });

    dom.passwordPresetList.addEventListener('click', (e) => {
        if (e.target.dataset.password) {
            const passwordToRemove = e.target.dataset.password;
            let presets = getPasswordPresets();
            presets = presets.filter(p => p !== passwordToRemove);
            savePasswordPresets(presets);
            renderPasswordPresets();
        }
    });
    
    dom.clearStorageButton.addEventListener('click', clearAnalysisData);
    dom.loadArea.addEventListener('click', () => dom.loadInput.click());
    dom.loadInput.addEventListener('change', (e) => handleLoadFile(e.target.files[0]));
    dom.loadArea.addEventListener('dragover', (e) => { e.preventDefault(); dom.loadArea.classList.add('active'); });
    dom.loadArea.addEventListener('dragleave', () => { dom.loadArea.classList.remove('active'); });
    dom.loadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.loadArea.classList.remove('active');
        handleLoadFile(e.dataTransfer.files[0]);
    });
    
    dom.saveButton.addEventListener('click', () => saveAnalysisData('bankStatement', fileQueue));

    dom.dragArea.addEventListener('click', () => dom.fileInput.click());
    dom.dragArea.addEventListener('dragover', (e) => { e.preventDefault(); dom.dragArea.classList.add('active'); });
    dom.dragArea.addEventListener('dragleave', () => { dom.dragArea.classList.remove('active'); });
    dom.dragArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.dragArea.classList.remove('active');
        handleFiles(e.dataTransfer.files);
    });
    dom.fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    dom.batchAnalyzeButton.addEventListener('click', processQueue);
    dom.passwordModalSubmit.addEventListener('click', () => {
        if (passwordResolver) {
            passwordResolver(dom.passwordModalInput.value);
            dom.passwordModal.classList.add('hidden');
            dom.passwordModalInput.value = '';
            dom.passwordModalError.classList.add('hidden');
        }
    });

    dom.fileQueueContainer.addEventListener('click', (e) => {
        const fileId = e.target.dataset.fileId;
        if (!fileId) return;
        
        const fileItem = fileQueue.find(item => item.id === fileId);
        if (!fileItem) return;

        if (e.target.classList.contains('reanalyze-btn')) {
            fileItem.status = 'pending';
            fileItem.result = null;
            renderFileQueue();
        } else if (e.target.classList.contains('mark-failed-btn')) {
            fileItem.status = 'error';
            fileItem.result = null;
            renderFileQueue();
            renderAggregatedResults();
        } else if (e.target.classList.contains('remove-file-btn')) {
            fileQueue = fileQueue.filter(item => item.id !== fileId);
            renderFileQueue();
            renderAggregatedResults();
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    runWhenReady(initializeApp);
});
