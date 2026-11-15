// Salas de ejemplo para las sedes que declaran salas (branches.halls_count) pero no tienen ninguna fila.
// Solo toca sedes con CERO salas: nunca modifica ni borra salas existentes. Lo usan la migracion 3 y el seed.
const PLAN = [
  { type: '2D', capacity: 180, price: 18 },
  { type: '3D', capacity: 140, price: 25 },
  { type: '2D', capacity: 120, price: 18 },
  { type: '3D', capacity: 100, price: 25 },
];

export function ensureSampleHalls(db) {
  const branches = db.prepare(`SELECT id, halls_count FROM branches WHERE halls_count > 0
    AND NOT EXISTS (SELECT 1 FROM halls h WHERE h.branch_id = branches.id) ORDER BY id`).all();
  const ins = db.prepare(`INSERT INTO halls (branch_id,name,type,capacity,status,price_base) VALUES (?,?,?,?, 'active', ?)`);
  let added = 0;
  for (const b of branches) {
    for (let i = 0; i < Math.min(b.halls_count, PLAN.length); i++) {
      const p = PLAN[i];
      ins.run(b.id, `Sala ${i + 1}`, p.type, p.capacity, p.price);
      added++;
    }
  }
  return added;
}
