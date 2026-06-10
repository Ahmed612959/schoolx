# 🏥 معهد رعاية الضبعية - نظام إدارة المعهد

نظام متكامل لإدارة معهد رعاية الضبعية الفني للتمريض يشمل إدارة الطلاب، الدرجات، الاختبارات، المخالفات، الإشعارات، ومكتبة الملفات.

## 📋 المميزات

- 🔐 **نظام مصادقة متكامل** (JWT + CSRF Tokens)
- 👨‍🎓 **إدارة الطلاب** (إضافة، تعديل، حذف، بحث)
- 📊 **نظام الدرجات والنتائج**
- 📝 **نظام الاختبارات الإلكترونية**
- 📢 **الإشعارات والإعلانات**
- ⚠️ **إدارة المخالفات**
- 📚 **مكتبة الملفات التعليمية**
- 👨‍👩‍👧 **نظام ولي الأمر**
- 🤖 **مساعد ذكي للدردشة**
- 🛡️ **حماية متقدمة ضد الاختراق**
- 📱 **تصميم متجاوب مع جميع الأجهزة**

## 🛠️ التقنيات المستخدمة

### Backend
- Node.js
- Express.js
- MongoDB + Mongoose
- JWT للمصادقة
- Bcrypt لتشفير كلمات المرور
- Express Rate Limit للحماية
- Helmet للأمان
- Multer لرفع الملفات

### Frontend
- HTML5
- CSS3
- JavaScript (ES6+)
- Font Awesome 6
- Google Fonts (Tajawal)
- Toastify.js للإشعارات

### الحماية
- منع فتح Console
- منع View Source
- منع النقر الأيمن
- CSRF Protection
- Rate Limiting
- Helmet Security Headers

## 🚀 التثبيت والتشغيل محلياً

### 1. استنساخ المشروع
```bash
git clone https://github.com/your-username/school-system-fiv.git
cd school-system-fiv
