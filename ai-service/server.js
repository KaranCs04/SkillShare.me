const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const app = express();
app.use(express.json());

const anthropic = new Anthropic(
    {
        apiKey:process.env.ANTHROPIC_API_KEY
    }
);
const PORT = process.env.PORT || 4000;

app.get('/health', (req, res) => {
    res.json({ status: 'AI service is running' });
})

app.post('/chat', async (req, res) => {
    try {
        const { message } = req.body;  // 

        if (!message || message.trim() === '') {
            return res.status(400).json({ error: 'A message is required' });
        }

        const response = await anthropic.messages.create({
            model: 'claude-haiku-4-5',
            max_tokens: 500,
            system: 'You are a helpful assistant for a skill-sharing platform.',
            messages: [
                { role: 'user', content: message }  // ✅ was 'question', now 'message'
            ]
        });

        const answer = response.content[0].text;
        res.json({ answer });

    } catch (err) {
        console.log(err.message);
        res.status(500).json({ error: 'Failed to get a response from AI' });
    }
});


app.listen(PORT, () => {
    console.log(`AI service running on http://localhost:${PORT}`);
})