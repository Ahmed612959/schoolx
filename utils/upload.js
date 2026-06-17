// utils/upload.js
const cloudinary = require('./cloudinary');
const { Readable } = require('stream');

/**
 * رفع ملف من Buffer إلى Cloudinary
 * @param {Buffer} buffer - محتوى الملف
 * @param {string} folder - المجلد في Cloudinary
 * @param {string} fileName - اسم الملف
 * @returns {Promise<Object>} - نتيجة الرفع
 */
const uploadToCloudinary = (buffer, folder, fileName) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: folder || 'school-files',
                resource_type: 'auto',
                public_id: fileName ? `${Date.now()}-${fileName}` : undefined
            },
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );
        
        // تحويل Buffer إلى Stream
        const readableStream = new Readable();
        readableStream.push(buffer);
        readableStream.push(null);
        readableStream.pipe(uploadStream);
    });
};

module.exports = { uploadToCloudinary };
