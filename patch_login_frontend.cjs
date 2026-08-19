const fs = require('fs');
let code = fs.readFileSync('src/components/LoginModal.tsx', 'utf8');

const loginSubmitRegex = /const handleSubmit = \(e: React\.FormEvent\) => \{[\s\S]*?\/\/ Success\n\s*setLoading\(false\);\n\s*onLoginSuccess\(emp\);\n\s*\};/;

const replacement = `const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const rawInput = loginMethod === 'code' ? employeeCode : employeePhone;
    if (!rawInput || !password) {
      setError(lang === 'ar' ? 'الرجاء إدخال جميع البيانات' : 'Please enter all fields');
      setLoading(false);
      return;
    }
    
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: rawInput, password: password })
      });
      
      const data = await res.json();
      if (data.success && data.employee) {
        setLoading(false);
        onLoginSuccess(data.employee);
      } else {
        setError(lang === 'ar' ? 'بيانات الدخول غير صحيحة. يرجى التأكد من كود الموظف وكلمة المرور' : 'Invalid login credentials.');
        setLoading(false);
      }
    } catch (err) {
      console.error('Login error', err);
      setError(lang === 'ar' ? 'خطأ في الاتصال بالخادم' : 'Server connection error');
      setLoading(false);
    }
  };`;

code = code.replace(loginSubmitRegex, replacement);
fs.writeFileSync('src/components/LoginModal.tsx', code);
