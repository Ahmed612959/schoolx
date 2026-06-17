// utils/cloudinary.js
const cloudinary = require('cloudinary').v2;

// تكوين Cloudinary (استخدم بياناتك الفعلية)
cloudinary.config({
    cloud_name: 'di47of300',
    api_key: '344972868721826',
    api_secret: 'HkoDVSfeDHmRQJjd4Q_B1uEQlpA' // استخدم الـ API Secret الخاص بك
});

module.exports = cloudinary;
