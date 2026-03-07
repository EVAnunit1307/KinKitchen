require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const path = require('path');
const express = require('express');
const uploadRoute = require('./routes/upload');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/api/upload', uploadRoute);

app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
