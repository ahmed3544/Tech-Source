const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src', 'App.tsx');
if (!fs.existsSync(file)) process.exit(0);
let s = fs.readFileSync(file, 'utf8');
const marker = '/* LOGIN_SESSION_PERSISTENCE_V2 */';
if (s.includes(marker)) process.exit(0);

const currentUserPattern = /const \[currentUser, setCurrentUser\] =\s*useState<Employee \| null>\(\(\) => \{[\s\S]*?\n\s*\}\);/;
const currentUserReplacement = `const [currentUser, setCurrentUser] =\n    useState<Employee | null>(() => {\n      try {\n        const candidates = [\n          localStorage.getItem('logged_in_user'),\n          sessionStorage.getItem('logged_in_user'),\n          localStorage.getItem('techsource_logged_in_user')\n        ];\n        for (const saved of candidates) {\n          if (!saved) continue;\n          const parsed = JSON.parse(saved) as Employee;\n          if (parsed?.id && parsed.status !== 'inactive') return parsed;\n        }\n      } catch {}\n      return null;\n    });`;
if (currentUserPattern.test(s)) s = s.replace(currentUserPattern, currentUserReplacement);
else console.warn('[login-session] currentUser initializer pattern not found; continuing safely');

const loginPattern = /setCurrentUser\(user\);[\s\S]{0,220}?localStorage\.setItem\(\s*['\"]logged_in_user['\"]\s*,\s*JSON\.stringify\(user\)\s*\);/;
const loginReplacement = `${marker}\n      setCurrentUser(user);\n      try {\n        const serializedUser = JSON.stringify(user);\n        localStorage.setItem('logged_in_user', serializedUser);\n        sessionStorage.setItem('logged_in_user', serializedUser);\n        localStorage.setItem('techsource_logged_in_user', serializedUser);\n      } catch {}`;
if (loginPattern.test(s)) s = s.replace(loginPattern, loginReplacement);

const anchor = /const \[isLoginModalOpen, setIsLoginModalOpen\] =\s*useState<boolean>\(\(\) => !currentUser\);/;
if (anchor.test(s) && !s.includes('LOGIN_SESSION_RESTORE_EFFECT_V2')) {
  s = s.replace(anchor, m => `${m}\n\n  /* LOGIN_SESSION_RESTORE_EFFECT_V2 */\n  useEffect(() => {\n    if (!currentUser?.id) return;\n    try {\n      const serializedUser = JSON.stringify(currentUser);\n      localStorage.setItem('logged_in_user', serializedUser);\n      sessionStorage.setItem('logged_in_user', serializedUser);\n      localStorage.setItem('techsource_logged_in_user', serializedUser);\n      setIsLoginModalOpen(false);\n    } catch {}\n  }, [currentUser]);`);
}

fs.writeFileSync(file, s, 'utf8');
console.log('[login-session] refresh-safe login persistence applied');
