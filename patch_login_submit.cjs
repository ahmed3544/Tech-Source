const fs = require('fs');
let code = fs.readFileSync('src/components/LoginModal.tsx', 'utf8');

const regex = /const handleSubmit = \(e: React\.FormEvent\) => \{[\s\S]*?\}, 400\);\n\s*\};/;
const replacement = `const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const toWesternDigits = (str: string) => {
      return str.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
    };
    
    const rawInput = toWesternDigits(code).trim();
    const cleanPass = toWesternDigits(password).trim();
    
    if (!rawInput || !cleanPass) {
      setError(lang === 'ar' ? 'الرجاء إدخال جميع البيانات' : 'Please enter all fields');
      setLoading(false);
      return;
    }
    
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: rawInput, password: cleanPass })
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

code = code.replace(regex, replacement);
fs.writeFileSync('src/components/LoginModal.tsx', code);
