const { checkPermissions } = require('./auth');

module.exports = (pool) => {
  const router = require('express').Router();

  router.get('/', checkPermissions(['manage_schedules', 'manage_library_students'], 'OR'), async (req, res) => {
    try {
      const result = await pool.query('SELECT *, fee FROM schedules ORDER BY created_at DESC, title');
      res.json({ schedules: result.rows });
    } catch (err) {
      console.error('Error fetching schedules:', err.stack);
      res.status(500).json({ message: 'Server error fetching schedules', error: err.message });
    }
  });

  router.get('/with-students', checkPermissions(['manage_schedules', 'manage_library_students'], 'OR'), async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT 
            s.id, 
            s.title, 
            s.description, 
            s.time, 
            s.event_date, 
            s.fee,
            s.created_at, 
            s.updated_at,
            COUNT(sa.student_id) as student_count
        FROM schedules s
        LEFT JOIN seat_assignments sa ON s.id = sa.shift_id 
        GROUP BY s.id, s.title, s.description, s.time, s.event_date, s.fee, s.created_at, s.updated_at
        ORDER BY s.event_date, s.time
      `);
      res.json({ schedules: result.rows });
    } catch (err) {
      console.error('Error fetching schedules with students:', err.stack);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  });

  router.get('/:id', checkPermissions(['manage_schedules', 'manage_library_students'], 'OR'), async (req, res) => {
    try {
      const scheduleId = parseInt(req.params.id, 10);
      if (isNaN(scheduleId)) {
        return res.status(400).json({ message: 'Invalid schedule ID format. Must be an integer.' });
      }
      const result = await pool.query('SELECT *, fee FROM schedules WHERE id = $1', [scheduleId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Schedule not found' });
      }
      res.json({ schedule: result.rows[0] });
    } catch (err) {
      console.error(`Error fetching schedule ${req.params.id}:`, err.stack);
      res.status(500).json({ message: 'Server error fetching schedule', error: err.message });
    }
  });

  router.post('/', checkPermissions(['manage_schedules']), async (req, res) => {
    try {
      const { title, description, time, event_date, fee } = req.body;
      if (!title || !time || !event_date || fee === undefined) {
        return res.status(400).json({ message: 'Title, time, event_date, and fee are required' });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(event_date)) {
        return res.status(400).json({ message: 'Invalid event_date format, use YYYY-MM-DD' });
      }
      if (typeof fee !== 'number' || fee < 0) {
        return res.status(400).json({ message: 'Fee must be a non-negative number' });
      }
      const result = await pool.query(
        `INSERT INTO schedules (title, description, time, event_date, fee, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING *`,
        [title, description || null, time, event_date, fee]
      );
      res.status(201).json({
        message: 'Schedule added successfully',
        schedule: result.rows[0]
      });
    } catch (err) {
      console.error('Error adding schedule:', err.stack);
      res.status(500).json({ message: 'Server error adding schedule', error: err.message });
    }
  });

  router.put('/:id', checkPermissions(['manage_schedules']), async (req, res) => {
    try {
      const scheduleId = parseInt(req.params.id, 10);
      if (isNaN(scheduleId)) {
        return res.status(400).json({ message: 'Invalid schedule ID format. Must be an integer.' });
      }
      const { title, description, time, event_date, fee } = req.body;
      if (event_date && !/^\d{4}-\d{2}-\d{2}$/.test(event_date)) {
        return res.status(400).json({ message: 'Invalid event_date format, use YYYY-MM-DD' });
      }
      if (fee !== undefined && (typeof fee !== 'number' || fee < 0)) {
        return res.status(400).json({ message: 'Fee must be a non-negative number' });
      }
      const result = await pool.query(
        `UPDATE schedules SET
          title = COALESCE($1, title),
          description = COALESCE($2, description),
          time = COALESCE($3, time),
          event_date = COALESCE($4, event_date),
          fee = COALESCE($5, fee),
          updated_at = NOW()
         WHERE id = $6 RETURNING *`,
        [title, description, time, event_date, fee, scheduleId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Schedule not found for update' });
      }
      res.json({
        message: 'Schedule updated successfully',
        schedule: result.rows[0]
      });
    } catch (err) {
      console.error(`Error updating schedule ${req.params.id}:`, err.stack);
      res.status(500).json({ message: 'Server error updating schedule', error: err.message });
    }
  });

  router.delete('/:id', checkPermissions(['manage_schedules']), async (req, res) => {
    try {
      const scheduleId = parseInt(req.params.id, 10);
      if (isNaN(scheduleId)) {
        return res.status(400).json({ message: 'Invalid schedule ID format. Must be an integer.' });
      }
      const result = await pool.query('DELETE FROM schedules WHERE id = $1 RETURNING *', [scheduleId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Schedule not found for deletion' });
      }
      res.json({
        message: 'Schedule deleted successfully',
        schedule: result.rows[0]
      });
    } catch (err) {
      console.error(`Error deleting schedule ${req.params.id}:`, err.stack);
      res.status(500).json({ message: 'Server error deleting schedule', error: err.message });
    }
  });

  return router;
};