const Database = require('better-sqlite3');
const db = new Database('d:/Project/My-Mini-Projects/M.A.D(Money Analysis and Decisions)/backend/mad.db');
db.pragma('foreign_keys=off');
db.exec('BEGIN TRANSACTION;');
db.exec(`CREATE TABLE recurring_bills_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL DEFAULT 'local-user',
  amount REAL NOT NULL,
  category TEXT NOT NULL,
  note TEXT,
  frequency TEXT NOT NULL CHECK(frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  dueDate TEXT NOT NULL,
  lastLoggedDate TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);`);
db.exec('INSERT INTO recurring_bills_new SELECT * FROM recurring_bills;');
db.exec('DROP TABLE recurring_bills;');
db.exec('ALTER TABLE recurring_bills_new RENAME TO recurring_bills;');
db.exec('COMMIT;');
db.pragma('foreign_keys=on');
console.log('Migration completed successfully.');
