// --- 1. IMPORT & SETUP ---
require('dotenv').config(); // โหลดค่าจาก .env (ต้องอยู่บนสุด)
const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
// (ลบ OpenAI ออก)
// const { OpenAI } = require('openai'); 

// (เพิ่ม) Import Google Gemini SDK
const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- (แก้ไข) DEBUGGING LOGS ---
console.log("--- Loading Environment Variables ---");
console.log(`[DEBUG] GEMINI_API_KEY loaded: ${process.env.GEMINI_API_KEY ? 'Yes, key found.' : 'No, key NOT found!'}`); // เปลี่ยนชื่อเช็ค
console.log(`[DEBUG] DIRECT_LINE_SECRET loaded: ${process.env.DIRECT_LINE_SECRET ? 'Yes, key found.' : 'No, key NOT found!'}`);
console.log("-------------------------------------");

const app = express();
const port = process.env.PORT || 3000;

// --- 2. MIDDLEWARE ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- 3. (แก้ไข) GEMINI CLIENT SETUP ---
// ตั้งค่า Gemini โดยดึง Key มาจากไฟล์ .env
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- 4. DIRECT LINE BOT SETUP (โค้ดเดิม) ---
const DIRECT_LINE_SECRET = process.env.DIRECT_LINE_SECRET;
const DIRECT_LINE_ENDPOINT = 'https://directline.botframework.com/v3/directline';
let conversationId = null; 

// --- 5. DIRECT LINE FUNCTION (โค้ดเดิม) ---
// ฟังก์ชันสำหรับคุยกับ Bot Framework
async function getBotReplyFromDirectLine(userMessage) {
    if (!DIRECT_LINE_SECRET) {
        console.error("Direct Line Secret is missing. Please check .env file.");
        return "ระบบ Direct Line ไม่ได้ตั้งค่า (ลืมใส่ Key ใน .env)";
    }
    try {
        if (!conversationId) {
            const startRes = await fetch(`${DIRECT_LINE_ENDPOINT}/conversations`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${DIRECT_LINE_SECRET}` }
            });
            const startData = await startRes.json();
            conversationId = startData.conversationId;
        }
        await fetch(`${DIRECT_LINE_ENDPOINT}/conversations/${conversationId}/activities`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DIRECT_LINE_SECRET}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: 'message', from: { id: 'user' }, text: userMessage
            })
        });
        await new Promise(resolve => setTimeout(resolve, 1500)); 
        const messagesRes = await fetch(`${DIRECT_LINE_ENDPOINT}/conversations/${conversationId}/activities`, {
            headers: { 'Authorization': `Bearer ${DIRECT_LINE_SECRET}` }
        });
        const messagesData = await messagesRes.json();
        const botReplies = messagesData.activities.filter(a => a.from.id !== 'user' && a.type === 'message');
        return botReplies.length > 0 ? botReplies[botReplies.length - 1].text : "บอทกำลังประมวลผล...";
    } catch (error) {
        console.error("Direct Line Error:", error);
        return "เกิดข้อผิดพลาดในการเชื่อมต่อกับบอทครับ";
    }
}

// --- 6. (แก้ไข) GEMINI FUNCTION ---
// ฟังก์ชันสำหรับคุยกับ Google Gemini
async function getGeminiReply(userMessage) {
    
    // (เพิ่ม) ตรวจสอบว่ามี Key หรือยัง
    if (!process.env.GEMINI_API_KEY) {
        console.error("Gemini API Key is missing. Please check .env file.");
        return "ระบบ AI (Gemini) ไม่ได้ตั้งค่า (ลืมใส่ Key ใน .env)";
    }

    try {
        console.log(`Sending prompt to Gemini: "${userMessage}"`);
        // เลือกรุ่นโมเดล (gemini-2.5-flash-preview-09-2025 คือรุ่นใหม่ที่เร็ว)
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-09-2025"});
        
        const result = await model.generateContent(userMessage);
        const response = await result.response;
        const replyText = response.text();

        console.log(`Received reply from Gemini: "${replyText}"`);
        return replyText;

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        return "ขออภัยค่ะ, ตอนนี้ระบบ AI (Gemini) มีปัญหา โปรดลองอีกครั้งในภายหลัง";
    }
}


// --- 7. MAIN CHAT ENDPOINT (แก้ไข) ---
app.post('/chat', async (req, res) => {
    const userMessage = req.body.message;
    let botReply = "";

    if (userMessage.startsWith('!bot')) {
        console.log("Routing to Direct Line Bot...");
        const botQuestion = userMessage.substring(4).trim(); 
        botReply = await getBotReplyFromDirectLine(botQuestion);
    } else {
        // (แก้ไข) เปลี่ยนไปเรียก Gemini
        console.log("Routing to Gemini...");
        botReply = await getGeminiReply(userMessage);
    }
    
    res.json({ reply: botReply });
});

// --- 8. SERVE FRONTEND (โค้ดเดิม) ---
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
    console.log("Chatbot is ready. Type '!bot' to talk to Direct Line, or type anything else for Gemini.");
});

