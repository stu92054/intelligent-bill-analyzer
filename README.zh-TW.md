# 智慧帳單分析儀 (Intelligent Bill Analyzer)

[English](README.md) | **繁體中文**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一款強大的純前端網頁應用，旨在幫助使用者輕鬆解析、管理並深入理解他們的 PDF 格式信用卡與銀行對帳單。本工具利用 Google Gemini AI 的強大能力，自動提取、分類交易數據，並提供視覺化的財務總覽與個人化的理財建議。

## ✨ 核心功能

* **多樣化帳單分析**：同時支援信用卡帳單與銀行對帳單的 PDF 檔案分析。
* **AI 智慧擷取**：自動從 PDF 中提取交易日期、說明、金額與類別，省去手動輸入的麻煩。
* **智慧 OCR 辨識**：當偵測到文字量不足的掃描檔或圖片型 PDF 時，會自動啟用 OCR 模式進行圖像辨識。
* **視覺化財務儀表板**：在「財務總覽」頁面，透過清晰的圖表（圓餅圖、長條圖）呈現您的收支狀況、消費分佈與資產趨勢。
* **AI 理財顧問**：
    * 一鍵產生基於您實際財務數據的個人化理財建議報告。
    * 支援針對報告內容進行**多輪對話**，深入釐清您的財務問題。
* **高度隱私保護**：所有 PDF 檔案的解析與 AI 分析都在您的**瀏覽器端**完成，您的個人財務資料**不會上傳到任何伺服器**，確保絕對的隱私與安全。
* **資料自主權**：支援將分析後的數據匯出為 `.json` 檔案進行本地備份，並可隨時匯入還原。

## 🚀 技術棧

* **前端**：HTML, CSS, JavaScript (ES6+)
* **樣式**：Tailwind CSS
* **圖表**：Chart.js
* **PDF 處理**：PDF.js
* **圖像處理 (OCR 前置)**：Jimp.js
* **AI 模型**：Google Gemini API

## 🛠️ 設定與使用

本專案為純前端應用，無需複雜的後端設定。

### 1. 取得程式碼

```bash
git clone [https://github.com/stu92054/intelligent-bill-analyzer.git](https://github.com/stu92054/intelligent-bill-analyzer.git)
```
### 2. 執行應用

直接在您的網頁瀏覽器中開啟以下任一檔案即可開始使用：
* `credit-card.html`
* `bank-statement.html`
* `summary.html`

> **注意**：建議透過 Live Server (VS Code 擴充功能) 或其他本地伺服器方式來運行，以避免潛在的檔案讀取問題。

### 3. 取得 Gemini API 金鑰

本工具的 AI 功能需要使用 Google Gemini API。

1.  前往 [Google AI Studio](https://aistudio.google.com/)。
2.  使用您的 Google 帳號登入。
3.  點擊 "**Get API key**" -> "**Create API key in new project**"。
4.  複製產生的 API 金鑰。

### 4. 操作流程

1.  **選擇分析頁面**：從頂部導覽列選擇「信用卡帳單」或「銀行對帳單」。
2.  **輸入 API 金鑰**：在頁面中找到 API 金鑰輸入框，貼上您剛剛複製的金鑰，並點擊「儲存金鑰」。
3.  **上傳帳單**：將一份或多份 PDF 帳單檔案拖曳至上傳區。
4.  **開始分析**：點擊「開始分析」按鈕。如果 PDF 有密碼，系統會提示您輸入。
5.  **檢視結果**：分析完成後，下方會顯示依月份彙總的交易明細與消費圖表。
6.  **財務總覽**：切換至「財務總覽」頁面，檢視跨帳戶的整合財務圖表。
7.  **獲取 AI 建議**：在總覽頁面下方，點擊「產生 AI 理財建議」，AI 會根據您的所有數據提供報告，並開啟對話視窗讓您進行追問。

## 📁 專案結構

```
.
├── css/
│   └── main.css          # 主要樣式檔
├── js/
│   ├── credit-card.js    # 信用卡頁面邏輯
│   ├── bank-statement.js # 銀行對帳單頁面邏輯
│   ├── summary.js        # 財務總覽頁面邏輯
│   ├── shared.js         # 共用函式 (API 呼叫、PDF 處理等)
│   └── nav.js            # 動態導覽列邏輯
├── credit-card.html      # 信用卡分析頁面
├── bank-statement.html   # 銀行對帳單分析頁面
├── summary.html          # 財務總覽頁面
├── README.md             # 專案說明文件 (英文)
├── README.zh-TW.md       # 專案說明文件 (繁體中文)
└── LICENSE               # 授權條款
```

## 🤝 貢獻

歡迎各種形式的貢獻！無論是回報問題、建議新功能，或是直接提交 Pull Request。

## 📄 授權

本專案採用 [MIT License](LICENSE) 授權。