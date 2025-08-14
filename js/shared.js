/**
 * @file shared.js
 * @description Contains shared logic for the entire application, including API interactions,
 * file handling, PDF processing, and a unified data storage system.
 */

// --- Global State & Configuration ---
const STORAGE_KEY = 'intelligentAnalyzerData'; // Unified storage key
let fileQueue = [];
let passwordResolver = null;

// --- DOM Element Cache ---
let dom = {};

// --- Initialization Functions ---

/**
 * Actively waits for required libraries (Jimp, Buffer) to be ready before executing the main app logic.
 * @param {function} callback The function to run once libraries are loaded.
 */
function runWhenReady(callback) {
    const libraries = ['Jimp', 'Buffer'];
    let checks = 0;
    console.log("等待關鍵函式庫載入...");

    const interval = setInterval(() => {
        checks++;
        const allReady = libraries.every(lib => typeof window[lib] !== 'undefined');

        if (allReady) {
            console.log(`所有函式庫 (${libraries.join(', ')}) 均已就緒 (耗時 ${checks * 100}ms)。啟動應用程式。`);
            clearInterval(interval);
            // Ensure Buffer is globally available if it was loaded via window.buffer
            if (typeof Buffer === 'undefined' && typeof window.buffer === 'object') {
                window.Buffer = window.buffer.Buffer;
                console.log("已手動設定 window.Buffer。");
            }
            callback();
        } else if (checks > 50) { // Timeout after 5 seconds
            clearInterval(interval);
            const missing = libraries.filter(lib => typeof window[lib] === 'undefined');
            console.error(`函式庫載入超時。缺失的函式庫: ${missing.join(', ')}`);
            alert(`一個或多個關鍵函式庫載入失敗 (${missing.join(', ')})，頁面可能無法正常運作。請嘗試重新整理頁面。`);
        }
    }, 100);
}


/**
 * Caches all frequently used DOM elements into the global `dom` object.
 */
function initializeDOMElements() {
    dom = {
        cutoffDayInput: document.getElementById('cutoff-day-input'),
        modelSelect: document.getElementById('model-select'),
        passwordPresetInput: document.getElementById('password-preset-input'),
        addPasswordPresetButton: document.getElementById('add-password-preset-button'),
        passwordPresetList: document.getElementById('password-preset-list'),
        loadArea: document.getElementById('load-area'),
        loadInput: document.getElementById('load-input'),
        loadStatus: document.getElementById('load-status'),
        saveButton: document.getElementById('save-button'),
        clearStorageButton: document.getElementById('clear-storage-button'),
        dragArea: document.getElementById('drag-area'),
        fileInput: document.getElementById('file-input'),
        part2: document.getElementById('part2'),
        fileQueueContainer: document.getElementById('file-queue'),
        apiKeyInput: document.getElementById('api-key-input'),
        saveApiKeyButton: document.getElementById('save-api-key-button'),
        clearApiKeyButton: document.getElementById('clear-api-key-button'),
        apiKeyStatus: document.getElementById('api-key-status'),
        batchAnalyzeButton: document.getElementById('batch-analyze-button'),
        part3: document.getElementById('part3'),
        aggregatedResultsContainer: document.getElementById('aggregated-results'),
        passwordModal: document.getElementById('password-modal'),
        passwordFilename: document.getElementById('password-filename'),
        passwordModalInput: document.getElementById('password-modal-input'),
        passwordModalError: document.getElementById('password-modal-error'),
        passwordModalSubmit: document.getElementById('password-modal-submit'),
    };
}

// --- Core Functions ---

function loadApiKey() {
    if (dom.apiKeyInput) {
        const savedKey = localStorage.getItem('geminiApiKey');
        if (savedKey) {
            dom.apiKeyInput.value = savedKey;
            dom.apiKeyStatus.textContent = '已載入儲存的金鑰。';
            setTimeout(() => dom.apiKeyStatus.textContent = '', 3000);
        }
    }
}

function getPasswordPresets() {
    const presets = localStorage.getItem('passwordPresets');
    return presets ? JSON.parse(presets) : [];
}

function savePasswordPresets(presets) {
    localStorage.setItem('passwordPresets', JSON.stringify(presets));
}

function renderPasswordPresets() {
    if (dom.passwordPresetList) {
        const presets = getPasswordPresets();
        dom.passwordPresetList.innerHTML = '';
        presets.forEach(p => {
            const chip = document.createElement('div');
            chip.className = 'password-chip';
            chip.innerHTML = `<span>••••••••</span><button data-password="${p}">&times;</button>`;
            dom.passwordPresetList.appendChild(chip);
        });
    }
}

function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
}

async function calculateFileHash(arrayBuffer) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

function promptForPassword(filename, wasIncorrect) {
    return new Promise(resolve => {
        dom.passwordFilename.textContent = filename;
        dom.passwordModalError.classList.toggle('hidden', !wasIncorrect);
        dom.passwordModal.classList.remove('hidden');
        dom.passwordModalInput.focus();
        passwordResolver = resolve;
    });
}

async function preprocessImage(base64Data) {
    try {
        const image = await Jimp.read(Buffer.from(base64Data, 'base64'));
        
        image
            .contrast(0.4) 
            .greyscale()   
            .quality(90);  
            
        const processedBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);
        return processedBuffer.toString('base64');
    } catch (error) {
        console.error("圖像預處理期間發生嚴重錯誤:", error);
        throw error;
    }
}


async function processPdfDocument(pdfDoc, hash, filename, getPromptFunction) {
    let fullText = '';
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map(item => item.str).join(' ') + '\n';
    }

    const meaningfulChars = fullText.match(/[\u4000-\u9fa5]/g) || [];
    const meaningfulCharCount = meaningfulChars.length;

    if (meaningfulCharCount < 150) { 
        console.log(`有效中文字量 (${meaningfulCharCount}) 過少，檔案 ${filename} 將啟用 OCR 模式並進行圖像預處理。`);
        const imageParts = [];
        for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const viewport = page.getViewport({ scale: 3.0 }); 
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            
            const base64Data = canvas.toDataURL('image/jpeg').split(',')[1];
            const processedBase64 = await preprocessImage(base64Data);
            
            imageParts.push({ inlineData: { mimeType: 'image/jpeg', data: processedBase64 } });
        }
        const ocrPrompt = getPromptFunction(hash) + `\n\n---\n# 輔助辨識資訊\n\n這份文件可能是圖片檔，以下是從中提取出的部分或不完整的文字，請將其作為 OCR 辨識時的參考，以提高準確度：\n\n\`\`\`\n${fullText}\n\`\`\`\n\n---\n# 主要任務\n\n請以**以下圖片**為主要分析對象，結合上述文字進行 OCR 並分析其內容：\n---`;
        return { apiParts: [{text: ocrPrompt}, ...imageParts], hash };
    } else {
        const sanitizedText = fullText.replace(/[A-Z][12]\d{8}/g, '[身分證已刪除]').replace(/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, '[卡號已刪除]').replace(/\b09\d{2}[- ]?\d{3}[- ]?\d{3}\b/g, '[電話已刪除]');
        const textPrompt = getPromptFunction(hash) + `\n\n---\n這是要分析的文字：\n---\n${sanitizedText}\n---`;
        return { apiParts: [{text: textPrompt}], hash };
    }
}

async function prepareApiPayload(pdfData, filename, getPromptFunction) {
    const presets = getPasswordPresets();
    const passwordsToTry = [null, ...presets];
    const hash = await calculateFileHash(pdfData);

    for (const password of passwordsToTry) {
        try {
            const pdfDoc = await pdfjsLib.getDocument({ data: pdfData, password: password }).promise;
            return await processPdfDocument(pdfDoc, hash, filename, getPromptFunction);
        } catch (error) {
            if (error.name !== 'PasswordException') throw error;
        }
    }

    let userPassword = await promptForPassword(filename, true);
    while (true) {
        if (userPassword === null) throw new Error('使用者取消輸入密碼');
        try {
            const pdfDoc = await pdfjsLib.getDocument({ data: pdfData, password: userPassword }).promise;
            return await processPdfDocument(pdfDoc, hash, filename, getPromptFunction);
        } catch (error) {
            if (error.name === 'PasswordException') {
                userPassword = await promptForPassword(filename, true);
            } else {
                throw error;
            }
        }
    }
}

async function analyzeWithGemini(apiParts, apiKey, hash, model) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const payload = { contents: [{ parts: apiParts }] };

    const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    
    if (!response.ok) {
        let errorDetails = `Status: ${response.status}`;
        try {
            const errorJson = await response.json();
            errorDetails += `, Body: ${JSON.stringify(errorJson)}`;
            console.error("API Error Response:", errorJson);
        } catch (e) {
            const errorText = await response.text();
            errorDetails += `, Body: ${errorText}`;
            console.error("API Error Response (non-JSON):", errorText);
        }
        throw new Error(`API 請求失敗 (${response.status})。請檢查您的 API 金鑰是否有效，或查看主控台以獲取詳細資訊。`);
    }

    const result = await response.json();
    
    if (result.candidates && result.candidates.length > 0 && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts.length > 0) {
        const jsonString = result.candidates[0].content.parts[0].text.replace(/```json\n?|```/g, '');
        const parsedJson = JSON.parse(jsonString);
        if (!parsedJson.billHash) {
            parsedJson.billHash = hash;
        }
        return parsedJson;
    } else {
        console.error("API did not return a valid candidate. Full response:", result);
        if (result.promptFeedback) {
            throw new Error(`AI 因安全設定而封鎖了回應。原因: ${result.promptFeedback.blockReason}`);
        }
        throw new Error('AI 回傳的資料格式不符預期。');
    }
}

function renderFileQueue() {
    if (!dom.fileQueueContainer) return;
    
    dom.fileQueueContainer.innerHTML = '';
    fileQueue.forEach(item => {
        let statusHtml = '';
        switch(item.status) {
            case 'pending': statusHtml = `<span class="text-gray-500">等待中</span>`; break;
            case 'processing': statusHtml = `<div class="flex items-center gap-2"><div class="spinner"></div><span class="text-blue-600">處理中...</span></div>`; break;
            case 'success': 
                statusHtml = `
                    <div class="flex items-center gap-2">
                        <span class="text-green-600 font-bold">${item.loadedFromLocal ? '✅ 已從本地載入' : '✅ 成功'}</span>
                        <button class="mark-failed-btn bg-red-500 text-white text-xs px-2 py-1 rounded hover:bg-red-600" data-file-id="${item.id}">標記失敗</button>
                    </div>
                `; 
                break;
            case 'error': 
                statusHtml = `
                    <div class="flex items-center gap-2">
                        <span class="text-red-600 font-bold">❌ 失敗</span>
                        <button class="reanalyze-btn bg-blue-500 text-white text-xs px-2 py-1 rounded hover:bg-blue-600" data-file-id="${item.id}">重新分析</button>
                    </div>
                `; 
                break;
        }
        const fileElement = document.createElement('div');
        fileElement.id = item.id;
        fileElement.className = 'flex justify-between items-center p-3 bg-gray-50 rounded-md border';
        fileElement.innerHTML = `<span class="truncate pr-4">${item.file.name}</span><div class="flex items-center gap-2">${statusHtml}<button class="remove-file-btn text-gray-400 hover:text-red-600" data-file-id="${item.id}">🗑️</button></div>`;
        dom.fileQueueContainer.appendChild(fileElement);
    });
}

// --- Unified Data Storage Functions ---

function saveAnalysisData(dataType, currentFileQueue) {
    const successfulItems = currentFileQueue.filter(item => item.status === 'success' && item.result);
    if (successfulItems.length === 0) {
        alert('沒有可儲存的分析結果。');
        return;
    }

    const dataToSaveForType = {};
    successfulItems.forEach(item => {
        const groupName = item.result.bankName || '未知銀行';
        if (!dataToSaveForType[groupName]) {
            dataToSaveForType[groupName] = { results: [] };
        }
        dataToSaveForType[groupName].results.push(item.result);
    });

    let allData = {};
    try {
        const existingData = localStorage.getItem(STORAGE_KEY);
        if (existingData) {
            allData = JSON.parse(existingData);
        }
    } catch (e) {
        console.error("讀取現有存檔失敗:", e);
        allData = {};
    }

    allData[dataType] = dataToSaveForType;
    
    const jsonString = JSON.stringify(allData, null, 2);

    try {
        localStorage.setItem(STORAGE_KEY, jsonString);
        dom.loadStatus.textContent = '✅ 結果已儲存至檔案並自動存檔於瀏覽器。';
        dom.loadStatus.classList.remove('hidden', 'text-red-600');
        dom.loadStatus.classList.add('text-green-600');
        setTimeout(() => dom.loadStatus.classList.add('hidden'), 4000);
    } catch (e) {
        console.error("儲存至 localStorage 失敗:", e);
        dom.loadStatus.textContent = '⚠️ 結果已儲存至檔案，但自動存檔失敗（可能是空間不足）。';
        dom.loadStatus.classList.remove('hidden', 'text-green-600');
        dom.loadStatus.classList.add('text-red-600');
    }

    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analysis_backup_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function loadAnalysisData(file) {
    return new Promise((resolve, reject) => {
        if (file) {
            if (file.type !== 'application/json') {
                return reject(new Error('請上傳 .json 格式的存檔。'));
            }
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    if (typeof data !== 'object' || data === null) throw new Error('無效的 JSON 格式。');
                    resolve(data);
                } catch (e) {
                    reject(new Error(`讀取檔案失敗: ${e.message}`));
                }
            };
            reader.readAsText(file);
        } else {
            try {
                const savedDataString = localStorage.getItem(STORAGE_KEY);
                if (savedDataString) {
                    resolve(JSON.parse(savedDataString));
                } else {
                    resolve(null);
                }
            } catch (e) {
                reject(new Error(`從瀏覽器讀取存檔失敗: ${e.message}`));
            }
        }
    });
}

function clearAnalysisData() {
    localStorage.removeItem(STORAGE_KEY);
    dom.loadStatus.textContent = '✅ 已清除瀏覽器中的所有自動存檔，頁面將會刷新。';
    dom.loadStatus.classList.remove('hidden', 'text-green-600');
    dom.loadStatus.classList.add('text-blue-600');
    setTimeout(() => {
        window.location.reload();
    }, 2000);
}
