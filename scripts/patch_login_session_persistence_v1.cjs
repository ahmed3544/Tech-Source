const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src', 'App.tsx');
if (!fs.existsSync(file)) process.exit(0);
let s = fs.readFileSync(file, 'utf8');
const marker = '/* LOGIN_SESSION_PERSISTENCE_V1 */';
if (s.includes(marker)) process.exit(0);

const oldInit = `  const [currentUser, setCurrentUser] =\n    useState<Employee | null>(() => {\n\n      try {\n        const saved =\n          localStorage.getItem(\n            'logged_in_user'\n          );\n\n        if (saved) {\n          const parsed =\n            JSON.parse(saved) as Employee;\n\n          if (\n            parsed?.id &&\n            parsed.status !== 'inactive'\n          ) {\n            return parsed;\n          }\n        }\n      } catch {}\n\n      return null;\n    });`;

const newInit = `  const [currentUser, setCurrentUser] =\n    useState<Employee | null>(() => {\n      try {\n        const candidates = [\n          localStorage.getItem('logged_in_user'),\n          sessionStorage.getItem('logged_in_user')\n        ];\n        for (const saved of candidates) {\n          if (!saved) continue;\n          const parsed = JSON.parse(saved) as Employee;\n          if (parsed?.id) return parsed;\n        }\n      } catch {}\n      return null;\n    });`;

if (!s.includes(oldInit)) {
  console.error('[login-session] currentUser initializer not found');
  process.exit(1);
}
s = s.replace(oldInit, newInit);

const oldLogin = `      setCurrentUser(user);\n\n      localStorage.setItem(\n        'logged_in_user',\n        JSON.stringify(user)\n      );`;
const newLogin = `      ${marker}\n      setCurrentUser(user);\n      try {\n        const serializedUser = JSON.stringify(user);\n        localStorage.setItem('logged_in_user', serializedUser);\n        sessionStorage.setItem('logged_in_user', serializedUser);\n      } catch {}`;
if (s.includes(oldLogin)) s = s.replace(oldLogin, newLogin);

const anchor = `  const [isLoginModalOpen, setIsLoginModalOpen] =\n    useState<boolean>(() => !currentUser);`;
const sessionEffect = `${anchor}\n\n  useEffect(() => {\n    if (!currentUser?.id) return;\n    try {\n      const serializedUser = JSON.stringify(currentUser);\n      localStorage.setItem('logged_in_user', serializedUser);\n      sessionStorage.setItem('logged_in_user', serializedUser);\n    } catch {}\n  }, [currentUser]);`;
if (s.includes(anchor) && !s.includes('const serializedUser = JSON.stringify(currentUser)')) s = s.replace(anchor, sessionEffect);

// Never treat a temporary empty server employee snapshot as a logout signal.
const oldCanonical = `            if (canonicalUser) { setCurrentUser(canonicalUser); try { localStorage.setItem('logged_in_user', JSON.stringify(canonicalUser)); } catch {} }`;
const newCanonical = `            if (canonicalUser) {\n              setCurrentUser(canonicalUser);\n              try {\n                const serializedUser = JSON.stringify(canonicalUser);\n                localStorage.setItem('logged_in_user', serializedUser);\n                sessionStorage.setItem('logged_in_user', serializedUser);\n              } catch {}\n            }`;
s = s.replace(oldCanonical, newCanonical);

fs.writeFileSync(file, s, 'utf8');
console.log('[login-session] refresh-safe login persistence applied');
