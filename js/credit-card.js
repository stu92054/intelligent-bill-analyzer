/**
 * @file credit-card.js
 * @description Contains all the logic specific to the Credit Card Analysis page.
 */

// --- Page-Specific State ---
let activeCharts = {};
let monthlyAndBankGroupedData = {}; 

// --- Prompt Generation ---

function getBasePrompt(hash) {
    return `# 類型：信用卡帳單分析

# 角色：金融數據分析專家

你是一位精通處理金融數據的 AI 專家。你的任務是從我提供的**信用卡帳單**內容中，提取所有交易，並應用特定邏輯，準確地將交易分類至 \`transactions\`（一般消費）或 \`rewards\`（回饋項目）兩個獨立的陣列中。

---

## 任務目標

分析提供的信用卡帳單內容，並嚴格按照指定的雙陣列 JSON 結構及處理邏輯輸出。

---

## 輸出要求

1.  **最終輸出必須是單一的、格式正確的 JSON 物件。**
2.  **不要在 JSON 物件前後添加任何說明、註解或 \`\`\`json ... \`\`\` 標記。**
3.  **分期付款處理邏輯 (Installment Plan Handling Logic): (優先規則)**
    * 當你辨識到一組關於**單筆分期消費**的交易模式時，該模式通常包含：
        a. **一筆原始全額的正向交易** (例如：\`XXX 10000\`)
        b. **一筆對應的、帶有「分期」字樣的全額負向交易** (例如：\`XXX分期 -10000\`)
        c. **一筆實際的、帶有期數說明的正向分期付款** (例如：\`XXX第1/10期 1000\`)
    * **處理規則：** 在最終的 JSON 輸出中，你**必須只保留(c)那筆實際的分期付款項目**。項目 (a) 和 (b) 必須被**忽略且不可計入** \`transactions\` 陣列中，以避免重複計算。
4.  **交易分類邏輯 (Transaction-Reward Sorting Logic):**
    * 在應用上述分期邏輯後，對剩餘的交易進行分類：
    * **一般消費（金額為正）**應放入根物件的 \`transactions\` 陣列中。
    * **回饋項目（金額為負**，且描述通常包含「回饋」、「返現」等）應放入根物件的 \`rewards\` 陣列中。
5.  **\`transactions\` 物件**應包含以下欄位，並遵循外幣處理邏輯：
    * \`date\`, \`description\`, \`amount\`, \`foreignAmount\`, \`foreignCurrency\`, \`category\`
    * **外幣處理邏輯:**
        * **如果是一筆外幣消費**，請同時填寫 \`foreignAmount\` (外幣金額), \`foreignCurrency\` (幣別)，以及 \`amount\` (換算後的台幣金額)。
        * **如果該外幣消費沒有顯示台幣金額** (例如雙幣卡)，則 \`amount\` 欄位應為 \`null\`。
        * **如果是一筆台幣消費**，\`foreignAmount\` 和 \`foreignCurrency\` 欄位應為 \`null\`。
6.  **\`rewards\` 物件**應包含以下欄位：
    * \`date\`, \`description\`, \`amount\`
7.  **消費分類 (\`category\`)：** 僅需對 \`transactions\` 陣列中的項目進行分類。分類列表如下：
    * \`餐飲美食\`, \`交通出行\`, \`購物消費\`, \`居家生活\`, \`休閒娛樂\`, \`醫療保健\`, \`帳單繳費\`, \`其他\`

---

## JSON 輸出格式範本

\`\`\`json
{
  "bankName": "發卡銀行或公司名稱",
  "billHash": "${hash}",
  "statementDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD",
  "totalAmount": 0,
  "transactions": [],
  "rewards": []
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
            
            const { apiParts, hash } = await prepareApiPayload(fileData, item.file.name, getBasePrompt);
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
        console.log("無有效的信用卡資料可載入。");
        return;
    }
    
    fileQueue = [];
    
    Object.values(data).forEach(bankData => {
        if (Array.isArray(bankData.results)) {
            bankData.results.forEach(res => {
                const fileId = `file-loaded-${res.billHash || crypto.randomUUID()}`;
                fileQueue.push({
                    id: fileId,
                    file: { name: `來自存檔: ${res.bankName || '未知'} (${res.statementDate || '無日期'})`},
                    status: 'success',
                    result: res,
                    hash: res.billHash,
                    loadedFromLocal: true
                });
            });
        }
    });

    dom.loadStatus.textContent = `✅ 已成功載入 ${fileQueue.length} 筆信用卡帳單紀錄。`;
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
        processLoadedData(fullData ? fullData.creditCard : null);
    } catch (error) {
        alert(error.message);
        dom.loadStatus.classList.add('hidden');
    }
}

async function autoLoadSavedData() {
    try {
        const fullData = await loadAnalysisData();
        processLoadedData(fullData ? fullData.creditCard : null);
    } catch (error) {
        console.error("自動載入失敗:", error);
    }
}


// --- UI Rendering and Event Handling ---

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

function renderAggregatedResults() {
    const successfulResults = fileQueue.filter(item => item.status === 'success' && item.result);
    dom.saveButton.disabled = successfulResults.length === 0;
    
    const cutoffDay = parseInt(dom.cutoffDayInput.value, 10);
    
    monthlyAndBankGroupedData = {};

    const monthlyGroups = successfulResults.reduce((acc, item) => {
        const billingMonth = getBillingMonth(item.result.statementDate, cutoffDay);
        if (!acc[billingMonth]) {
            acc[billingMonth] = [];
        }
        acc[billingMonth].push(item);
        return acc;
    }, {});

    Object.values(activeCharts).forEach(chart => chart.destroy());
    activeCharts = {};
    
    dom.aggregatedResultsContainer.innerHTML = '';
    
    const sortedMonths = Object.keys(monthlyGroups).sort().reverse();

    if (sortedMonths.length > 0) {
        sortedMonths.forEach(month => {
            const monthItems = monthlyGroups[month];
            const monthSection = createMonthSection(month, monthItems);
            dom.aggregatedResultsContainer.appendChild(monthSection);
            
            const bankGroups = monthlyAndBankGroupedData[month];
            for (const bankName in bankGroups) {
                updateSubtotals(bankName, month);
            }
        });
        dom.part3.classList.remove('hidden');
    } else {
        dom.part3.classList.add('hidden');
    }
}

function createMonthSection(month, items) {
    const section = document.createElement('section');
    section.className = 'month-section';
    section.dataset.month = month;

    section.innerHTML = `<h3 class="text-2xl font-bold mb-4 border-b pb-2">帳單月份：${month}</h3>`;

    const contentGrid = document.createElement('div');
    contentGrid.className = 'grid lg:grid-cols-3 gap-8';
    
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'lg:col-span-2 space-y-6';

    const bankGroups = items.reduce((acc, item) => {
        const bankName = item.result.bankName || '未知銀行';
        if (!acc[bankName]) {
            acc[bankName] = { 
                transactions: [], 
                rewards: [], 
                totalAmount: 0, 
                count: 0,
                txSortState: { key: 'date', direction: 'asc' },
                rwSortState: { key: 'date', direction: 'asc' }
            };
        }
        if(Array.isArray(item.result.transactions)) acc[bankName].transactions.push(...item.result.transactions.map((tx, index) => ({...tx, originalIndex: `${item.id}_${index}`})));
        if(Array.isArray(item.result.rewards)) acc[bankName].rewards.push(...item.result.rewards.map((rw, index) => ({...rw, originalIndex: `${item.id}_${index}`})));
        acc[bankName].totalAmount += item.result.totalAmount || 0;
        acc[bankName].count++;
        return acc;
    }, {});

    monthlyAndBankGroupedData[month] = bankGroups;

    for (const bankName in bankGroups) {
        const card = createResultCard(bankName, bankGroups[bankName], month);
        cardsContainer.appendChild(card);
    }
    
    contentGrid.appendChild(cardsContainer);
    
    const chartContainer = createMonthlyChartContainer(month);
    contentGrid.appendChild(chartContainer);

    section.appendChild(contentGrid);
    
    setTimeout(() => renderMonthlyChart(month, items), 0);
    
    return section;
}

function createResultCard(bankName, data, month) {
    const card = document.createElement('div');
    card.className = 'bg-white p-6 rounded-lg shadow-sm space-y-6';
    card.dataset.bankName = bankName;
    card.dataset.month = month;

    card.innerHTML = `
        <div>
            <h4 class="text-xl font-bold mb-2">${bankName}</h4>
            <div class="grid grid-cols-2 gap-4 mb-4 text-center">
                <div><p class="text-sm text-gray-500">帳單數量</p><p class="text-lg font-semibold">${data.count}</p></div>
                <div><p class="text-sm text-gray-500">總應繳金額</p><p class="text-lg font-semibold text-red-600">${data.totalAmount.toLocaleString()}</p></div>
            </div>
        </div>
    `;
    
    const txContainer = document.createElement('div');
    txContainer.innerHTML = `<h5 class="text-lg font-semibold mb-2 border-b pb-1">消費明細</h5>`;
    const txTable = createTable(['日期', '說明', '類別', '外幣', '台幣金額', '操作'], ['date', 'description', 'category', 'foreignAmount', 'amount', 'actions'], 'transactions');
    txContainer.appendChild(txTable);
    card.appendChild(txContainer);
    renderTableRows(txTable.querySelector('tbody'), data.transactions, 'transactions');

    if (data.rewards.length > 0 || data.transactions.length > 0) {
        const rwContainer = document.createElement('div');
        rwContainer.innerHTML = `<h5 class="text-lg font-semibold mb-2 border-b pb-1">回饋與折扣</h5>`;
        const rwTable = createTable(['日期', '說明', '回饋金額', '操作'], ['date', 'description', 'amount', 'actions'], 'rewards');
        rwContainer.appendChild(rwTable);
        card.appendChild(rwTable);
        renderTableRows(rwTable.querySelector('tbody'), data.rewards, 'rewards');
    }
    
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
    if (items.length === 0) {
        const colSpan = (type === 'transactions') ? 6 : 4;
        tbody.innerHTML = `<tr><td colspan="${colSpan}" class="text-center py-4 text-gray-500">無紀錄</td></tr>`;
        return;
    }
    items.forEach((item) => {
        const row = document.createElement('tr');
        row.className = 'border-b hover:bg-gray-50';
        
        if (type === 'transactions') {
            const foreignCurrencyHtml = (item.foreignAmount && item.foreignCurrency) ? `${parseFloat(item.foreignAmount).toLocaleString()} ${item.foreignCurrency}` : '-';
            row.innerHTML = `
                <td class="py-2 px-3" contenteditable="true" data-index="${item.originalIndex}" data-field="date">${item.date || ''}</td>
                <td class="py-2 px-3" contenteditable="true" data-index="${item.originalIndex}" data-field="description">${item.description || ''}</td>
                <td class="py-2 px-3" contenteditable="true" data-index="${item.originalIndex}" data-field="category">${item.category || '其他'}</td>
                <td class="py-2 px-3 text-center">${foreignCurrencyHtml}</td>
                <td class="py-2 px-3 text-right font-medium" contenteditable="true" data-index="${item.originalIndex}" data-field="amount">${(item.amount === null ? 'N/A' : (item.amount || 0).toLocaleString())}</td>
                <td class="py-2 px-3 text-center"><button class="delete-row-btn text-gray-400 hover:text-red-600" data-index="${item.originalIndex}">🗑️</button></td>
            `;
        } else { // rewards
            row.innerHTML = `
                <td class="py-2 px-3" contenteditable="true" data-index="${item.originalIndex}" data-field="date">${item.date || ''}</td>
                <td class="py-2 px-3" contenteditable="true" data-index="${item.originalIndex}" data-field="description">${item.description || ''}</td>
                <td class="py-2 px-3 text-right font-medium text-green-600" contenteditable="true" data-index="${item.originalIndex}" data-field="amount">${(item.amount || 0).toLocaleString()}</td>
                <td class="py-2 px-3 text-center"><button class="delete-row-btn text-gray-400 hover:text-red-600" data-index="${item.originalIndex}">🗑️</button></td>
            `;
        }
        tbody.appendChild(row);
    });
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
            
            const lastUnderscoreIndex = index.lastIndexOf('_');
            if (lastUnderscoreIndex === -1) return;
            
            const fileId = index.substring(0, lastUnderscoreIndex);
            const itemIndex = parseInt(index.substring(lastUnderscoreIndex + 1), 10);
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
                const cutoffDay = parseInt(dom.cutoffDayInput.value, 10);
                const dateForMonth = month + '-' + String(cutoffDay).padStart(2, '0');
                manualFileItem = {
                    id: `manual-${month}-${bankName}`,
                    file: { name: `手動新增 - ${bankName} (${month})`},
                    status: 'success',
                    result: {
                        bankName: bankName,
                        statementDate: dateForMonth,
                        transactions: [],
                        rewards: []
                    },
                    loadedFromLocal: true
                };
                fileQueue.push(manualFileItem);
            }

            const newEntry = (tableType === 'transactions')
                ? { date: '', description: '手動新增', amount: 0, category: '其他' }
                : { date: '', description: '手動新增', amount: 0 };
            
            manualFileItem.result[tableType].push(newEntry);
            renderAggregatedResults();
        }
    });

    card.addEventListener('blur', (e) => {
        if (e.target.matches('[contenteditable="true"]')) {
            const bankName = e.target.closest('[data-bank-name]').dataset.bankName;
            const month = e.target.closest('[data-month]').dataset.month;
            if (!bankName || !month) return;

            const tableType = e.target.closest('table').dataset.tableType;
            const index = e.target.dataset.index;
            const field = e.target.dataset.field;
            let value = e.target.textContent;

            const lastUnderscoreIndex = index.lastIndexOf('_');
            if (lastUnderscoreIndex === -1) return;
            
            const fileId = index.substring(0, lastUnderscoreIndex);
            const itemIndex = parseInt(index.substring(lastUnderscoreIndex + 1), 10);
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

            updateSubtotals(bankName, month);
            
            const cutoffDay = parseInt(dom.cutoffDayInput.value, 10);
            const monthItems = fileQueue.filter(item => getBillingMonth(item.result.statementDate, cutoffDay) === month);
            renderMonthlyChart(month, monthItems);
        }
    }, true);
}

function handleSort(month, bankName, tableType, sortBy) {
    const data = monthlyAndBankGroupedData[month][bankName];
    const sortState = tableType === 'transactions' ? data.txSortState : data.rwSortState;

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
            const parseDate = (str) => {
                if (!str) return new Date(0);
                const cleanStr = str.replace(/-/g, '/');
                return cleanStr.includes('/') ? new Date(cleanStr) : new Date(`2024/${cleanStr}`);
            };
            valA = parseDate(valA);
            valB = parseDate(valB);
        } else if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = (valB || '').toLowerCase();
        } else {
            valA = (valA === null || isNaN(valA)) ? -Infinity : valA;
            valB = (valB === null || isNaN(valB)) ? -Infinity : valB;
        }

        let comparison = 0;
        if (valA > valB) {
            comparison = 1;
        } else if (valA < valB) {
            comparison = -1;
        }
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

function updateSubtotals(bankName, month) {
    const cardElement = document.querySelector(`[data-bank-name="${bankName}"][data-month="${month}"]`);
    if (!cardElement) return;
    
    const cutoffDay = parseInt(dom.cutoffDayInput.value, 10);
    const itemsForThisBankInMonth = fileQueue.filter(item => 
        item.status === 'success' && 
        item.result && 
        item.result.bankName === bankName &&
        getBillingMonth(item.result.statementDate, cutoffDay) === month
    );

    const txSubtotal = itemsForThisBankInMonth.reduce((sum, item) => sum + (item.result.transactions || []).reduce((txSum, tx) => txSum + (tx.amount || 0), 0), 0);
    const rwSubtotal = itemsForThisBankInMonth.reduce((sum, item) => sum + (item.result.rewards || []).reduce((rwSum, rw) => rwSum + (rw.amount || 0), 0), 0);

    const txTable = cardElement.querySelector('table[data-table-type="transactions"]');
    if (txTable) {
        let tfoot = txTable.querySelector('tfoot');
        tfoot.innerHTML = `<tr><td colspan="5" class="py-2 px-3 text-right font-bold">消費小計</td><td class="py-2 px-3 text-right font-bold">${txSubtotal.toLocaleString()}</td></tr>
                         <tr><td colspan="6" class="text-center py-1"><button class="add-row-btn text-indigo-600 hover:text-indigo-800 text-sm font-bold" data-table-type="transactions">➕ 新增</button></td></tr>`;
    }

    const rwTable = cardElement.querySelector('table[data-table-type="rewards"]');
    if (rwTable) {
        let tfoot = rwTable.querySelector('tfoot');
        tfoot.innerHTML = `<tr><td colspan="3" class="py-2 px-3 text-right font-bold">回饋小計</td><td class="py-2 px-3 text-right font-bold text-green-600">${rwSubtotal.toLocaleString()}</td></tr>
                         <tr><td colspan="4" class="text-center py-1"><button class="add-row-btn text-indigo-600 hover:text-indigo-800 text-sm font-bold" data-table-type="rewards">➕ 新增</button></td></tr>`;
    }
}

function createMonthlyChartContainer(month) {
    const container = document.createElement('div');
    container.className = 'lg:col-span-1';
    
    const stickyWrapper = document.createElement('div');
    stickyWrapper.className = 'bg-white p-6 rounded-lg shadow-sm sticky top-4';
    
    stickyWrapper.innerHTML = `
        <p class="text-lg text-gray-600 text-center">該月總支出</p>
        <p id="total-spending-${month}" class="text-4xl font-bold text-red-600 text-center mb-4">0</p>
    `;

    const canvasContainer = document.createElement('div');
    canvasContainer.className = 'relative h-80';
    const canvas = document.createElement('canvas');
    canvas.id = `chart-${month}`;
    canvasContainer.appendChild(canvas);
    stickyWrapper.appendChild(canvasContainer);
    container.appendChild(stickyWrapper);
    return container;
}

function renderMonthlyChart(month, items) {
    const totalEl = document.getElementById(`total-spending-${month}`);
    const canvas = document.getElementById(`chart-${month}`);
    if (!canvas || !totalEl) return;

    let totalSpending = 0;
    const categorySpending = {};

    items.forEach(item => {
        if (item.result && Array.isArray(item.result.transactions)) {
            item.result.transactions.forEach(tx => {
                if (tx.amount && tx.amount > 0) {
                    totalSpending += tx.amount;
                    const category = tx.category || '其他';
                    categorySpending[category] = (categorySpending[category] || 0) + tx.amount;
                }
            });
        }
    });

    totalEl.textContent = `NT$ ${totalSpending.toLocaleString()}`;

    const labels = Object.keys(categorySpending);
    const data = Object.values(categorySpending);
    const backgroundColors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF', '#4D5360'];

    if (activeCharts[month]) {
        activeCharts[month].destroy();
    }

    activeCharts[month] = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                label: '消費金額',
                data: data,
                backgroundColor: backgroundColors.slice(0, labels.length),
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) label += ': ';
                            if (context.parsed !== null) {
                                const value = context.parsed;
                                const percentage = totalSpending > 0 ? ((value / totalSpending) * 100).toFixed(2) : 0;
                                label += `NT$ ${value.toLocaleString()} (${percentage}%)`;
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

function loadPasswordPresets() {
    renderPasswordPresets();
}

// --- Initializers and Event Listeners Setup ---

/**
 * Main application entry point.
 * Initializes DOM elements and sets up all event listeners.
 */
function initializeApp() {
    initializeDOMElements();
    loadApiKey();
    loadPasswordPresets();
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

    dom.cutoffDayInput.addEventListener('change', () => {
        if (fileQueue.some(item => item.status === 'success')) {
            renderAggregatedResults();
        }
    });
    
    dom.loadArea.addEventListener('click', () => dom.loadInput.click());
    dom.loadInput.addEventListener('change', (e) => handleLoadFile(e.target.files[0]));
    dom.loadArea.addEventListener('dragover', (e) => { e.preventDefault(); dom.loadArea.classList.add('active'); });
    dom.loadArea.addEventListener('dragleave', () => { dom.loadArea.classList.remove('active'); });
    dom.loadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.loadArea.classList.remove('active');
        handleLoadFile(e.dataTransfer.files[0]);
    });
    
    dom.saveButton.addEventListener('click', () => saveAnalysisData('creditCard', fileQueue));
    
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
