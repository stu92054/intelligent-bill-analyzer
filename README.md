# Intelligent Bill Analyzer

**English** | [繁體中文](README.zh-TW.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful, client-side web application designed to help users effortlessly parse, manage, and gain deep insights from their credit card and bank statements in PDF format. This tool leverages the power of the Google Gemini AI to automatically extract and categorize transaction data, providing a visual financial overview and personalized financial advice.

## ✨ Core Features

* **Diverse Bill Analysis**: Supports both credit card and bank statement PDF files.
* **AI-Powered Data Extraction**: Automatically extracts transaction dates, descriptions, amounts, and categories from PDFs, eliminating the need for manual entry.
* **Smart OCR Recognition**: Automatically activates OCR mode for scanned or image-based PDFs with insufficient text data.
* **Visual Financial Dashboard**: The "Summary" page features clear charts (doughnut, bar) to visualize your income vs. expenses, spending distribution, and asset trends.
* **AI Financial Advisor**:
    * Generate a personalized financial advice report based on your actual data with a single click.
    * Engage in a **multi-turn conversational chat** to clarify and delve deeper into your financial questions.
* **Privacy-Focused Design**: All PDF parsing is performed **entirely on the client-side (in your browser)**, ensuring your original files are not exposed. Only when you request an AI analysis, the extracted text data is sent to Google for processing. This tool **does not store** your personal financial data on any server.
* **Data Sovereignty**: Export your analyzed data as a `.json` file for local backup and import it anytime to restore your session.

## 🚀 Tech Stack

* **Frontend**: HTML, CSS, JavaScript (ES6+)
* **Styling**: Tailwind CSS
* **Charts**: Chart.js
* **PDF Processing**: PDF.js
* **Image Processing (for OCR)**: Jimp.js
* **AI Model**: Google Gemini API

## 🛠️ Setup and Usage

This is a pure front-end application and requires no complex backend setup.

### 1. Get the Code

```bash
git clone [https://github.com/stu92054/intelligent-bill-analyzer.git](https://github.com/stu92054/intelligent-bill-analyzer.git)
```

### 2. Run the Application

Simply open one of the following HTML files in your web browser to get started:

* `credit-card.html`
* `bank-statement.html`
* `summary.html`

> **Note**: It is recommended to run the files using a local server, such as the Live Server extension in VS Code, to avoid potential file access issues.

### 3. Get a Gemini API Key

The AI features of this tool require a Google Gemini API key.

1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Log in with your Google account.
3. Click "**Get API key**" -> "**Create API key in new project**".
4. Copy the generated API key.

### 4. How to Use

1. **Select an Analysis Page**: Choose "Credit Card" or "Bank Statement" from the top navigation bar.
2. **Enter API Key**: Find the API key input field on the page, paste your key, and click "Save Key".
3. **Upload Bills**: Drag and drop one or more PDF statement files into the upload area.
4. **Start Analysis**: Click the "Start Analysis" button. You will be prompted for a password if a PDF is encrypted.
5. **View Results**: Once the analysis is complete, a monthly summary with transaction details and charts will be displayed.
6. **Financial Summary**: Navigate to the "Summary" page to view an integrated dashboard across all your accounts.
7. **Get AI Advice**: In the summary page, click "Generate AI Financial Advice". The AI will provide a report based on all your data and open a chat window for follow-up questions.

## 📁 Project Structure

```
.
├── css/
│   └── main.css          # Main stylesheet
├── js/
│   ├── credit-card.js    # Logic for the Credit Card page
│   ├── bank-statement.js # Logic for the Bank Statement page
│   ├── summary.js        # Logic for the Summary page
│   ├── shared.js         # Shared functions (API calls, PDF processing, etc.)
│   └── nav.js            # Dynamic navigation bar logic
├── credit-card.html      # Credit Card analysis page
├── bank-statement.html   # Bank Statement analysis page
├── summary.html          # Financial Summary page
├── README.md             # Project documentation (English)
├── README.zh-TW.md       # Project documentation (Traditional Chinese)
└── LICENSE               # License file
```

## 🤝 Contributing

Contributions of all kinds are welcome! Feel free to open an issue, suggest a feature, or submit a pull request.

## 📄 License

This project is licensed under the [MIT License](LICENSE).