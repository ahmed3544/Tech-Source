const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const updateEmpRegex = /const handleUpdateEmployee = \(updatedEmp: Employee\) => \{[\s\S]*?\/\/ If updating currently logged in user/;

const replacement = `const handleUpdateEmployee = async (updatedEmp: Employee) => {
    // Optimistic UI update
    const nextEmps = employeesRef.current.map(e => {
      if (e.id === updatedEmp.id) {
        const finalAvatar = updatedEmp._isPhotoRemoved
          ? ''
          : (updatedEmp.avatar && updatedEmp.avatar.trim() !== '' ? updatedEmp.avatar : (e.avatar || ''));
        return {
          ...e,
          ...updatedEmp,
          avatar: finalAvatar,
        };
      }
      return e;
    });

    employeesRef.current = nextEmps;
    localStorage.setItem('attendance_employees', JSON.stringify(nextEmps));
    setEmployees(nextEmps);

    try {
      const res = await fetch(\`/api/employees/\${updatedEmp.id}\`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextEmps.find(e => e.id === updatedEmp.id))
      });
      if (res.ok) {
        const data = await res.json();
        if (data.employee) {
          // Confirm with server response
          const confirmedEmps = employeesRef.current.map(e => e.id === updatedEmp.id ? data.employee : e);
          employeesRef.current = confirmedEmps;
          setEmployees(confirmedEmps);
          localStorage.setItem('attendance_employees', JSON.stringify(confirmedEmps));
        }
      }
    } catch (err) {
      console.error('Failed to update employee on server', err);
    }

    // If updating currently logged in user`;

code = code.replace(updateEmpRegex, replacement);
fs.writeFileSync('src/App.tsx', code);
