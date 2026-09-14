const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src', 'App.tsx');
if (!fs.existsSync(file)) process.exit(0);
let s = fs.readFileSync(file, 'utf8');
const marker = '/* LOGIN_SESSION_PERSISTENCE_V1 */';
if (s.includes(marker)) process.exit(0);

// Keep this patch resilient to formatting changes made by earlier prebuild patches.
const currentUserRegex = /  const \[currentUser, setCurrentUser\] =\s*useState<Employee \| null>\(\(\) => \{[\s\S]*?\n  \}\);/;
const currentUserReplacement = `  const [currentUser, setCurrentUser] = useState<Employee | null>(() => {
    try {
      const candidates = [
        localStorage.getItem('logged_in_user'),
        sessionStorage.getItem('logged_in_user')
      ];
      for (const saved of candidates) {
        if (!saved) continue;
        const parsed = JSON.parse(saved) as Employee;
        if (parsed?.id && parsed.status !== 'inactive') return parsed;
      }
    } catch {}
    return null;
  });`;

if (currentUserRegex.test(s)) s = s.replace(currentUserRegex, currentUserReplacement);

const loginRegex = /(setCurrentUser\(user\);\s*)(?:localStorage\.setItem\(\s*['"]logged_in_user['"],\s*JSON\.stringify\(user\)\s*\);)/;
if (loginRegex.test(s)) {
  s = s.replace(loginRegex, `$1${marker}\n      try {\n        const serializedUser = JSON.stringify(user);\n        localStorage.setItem('logged_in_user', serializedUser);\n        sessionStorage.setItem('logged_in_user', serializedUser);\n      } catch {}`);
}

const anchor = /  const \[isLoginModalOpen, setIsLoginModalOpen\] =\s*useState<boolean>\(\(\) => !currentUser\);/;
if (anchor.test(s) && !s.includes('LOGIN_SESSION_RESTORE_EFFECT_V1')) {
  s = s.replace(anchor, match => `${match}\n\n  /* LOGIN_SESSION_RESTORE_EFFECT_V1 */\n  useEffect(() => {\n    if (!currentUser?.id) return;\n    try {\n      const serializedUser = JSON.stringify(currentUser);\n      localStorage.setItem('logged_in_user', serializedUser);\n      sessionStorage.setItem('logged_in_user', serializedUser);\n      setIsLoginModalOpen(false);\n    } catch {}\n  }, [currentUser]);`);
}

const canonicalRegex = /if \(canonicalUser\) \{[\s\S]*?localStorage\.setItem\(['"]logged_in_user['"],\s*JSON\.stringify\(canonicalUser\)\);[\s\S]*?\}/;
if (canonicalRegex.test(s)) {
  s = s.replace(canonicalRegex, `if (canonicalUser) {
              setCurrentUser(canonicalUser);
              try {
                const serializedUser = JSON.stringify(canonicalUser);
                localStorage.setItem('logged_in_user', serializedUser);
                sessionStorage.setItem('logged_in_user', serializedUser);
              } catch {}
            }`);
}

fs.writeFileSync(file, s, 'utf8');
console.log('[login-session] refresh-safe login persistence applied');
