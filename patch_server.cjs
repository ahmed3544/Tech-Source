const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const employeePutRoute = `
// PUT /api/employees/:id - Update employee
app.put('/api/employees/:id', async (req, res) => {
  const { id } = req.params;
  const reqBody = req.body;
  if (!reqBody) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  if (process.env.SUPABASE_DB_URL) {
    try {
      const { id: _ignore, _isPhotoRemoved, ...updateFields } = reqBody;
      await db.update(schema.employees)
        .set(updateFields)
        .where(sql\`id = \${id}\`);
      
      const updated = await db.select().from(schema.employees).where(sql\`id = \${id}\`);
      return res.json({ success: true, employee: updated[0], lastUpdated: Date.now() });
    } catch (err) {
      console.error("[EMPLOYEE-UPDATE-ERROR]", err);
      return res.status(500).json({ success: false, error: String(err) });
    }
  }

  const index = serverState.employees?.findIndex((e) => e.id === id);
  if (index !== undefined && index >= 0 && serverState.employees) {
    serverState.employees[index] = { ...serverState.employees[index], ...reqBody };
    serverState.lastUpdated = Date.now();
    saveServerData(serverState);
    res.json({ success: true, employee: serverState.employees[index], lastUpdated: serverState.lastUpdated });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});
`;

if (!code.includes("app.put('/api/employees/:id'")) {
  code = code.replace("app.post('/api/sync', async (req, res) => {", employeePutRoute + "\napp.post('/api/sync', async (req, res) => {");
  fs.writeFileSync('server.ts', code);
}
