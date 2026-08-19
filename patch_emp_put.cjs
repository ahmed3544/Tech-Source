const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const updatedPutRoute = `app.put('/api/employees/:id', async (req, res) => {
  const { id } = req.params;
  const reqBody = req.body;
  if (!reqBody) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  // Hash pin if provided
  if (reqBody.pin && reqBody.pin !== '***') {
    const crypto = require('crypto');
    // Basic SHA-256 for now, enough to hide plaintext
    reqBody.pin = crypto.createHash('sha256').update(reqBody.pin).digest('hex');
  } else {
    delete reqBody.pin; // Do not overwrite with '***'
  }

  if (process.env.SUPABASE_DB_URL) {
    try {
      const { id: _ignore, _isPhotoRemoved, ...updateFields } = reqBody;
      await db.update(schema.employees)
        .set(updateFields)
        .where(sql\`id = \${id}\`);
      
      const updated = await db.select().from(schema.employees).where(sql\`id = \${id}\`);
      const safeEmp = { ...updated[0], pin: '***' };
      return res.json({ success: true, employee: safeEmp, lastUpdated: Date.now() });
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
    const safeEmp = { ...serverState.employees[index], pin: '***' };
    res.json({ success: true, employee: safeEmp, lastUpdated: serverState.lastUpdated });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});`;

code = code.replace(/app\.put\('\/api\/employees\/:id'[\s\S]*?res\.status\(404\)\.json\(\{ error: 'Not found' \}\);\n  \}\n\}\);/, updatedPutRoute);

fs.writeFileSync('server.ts', code);
