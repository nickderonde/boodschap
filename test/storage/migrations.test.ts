// NF-13: lokale database-migraties; upgrade van een oudere versie behoudt data.
import { NodeSqliteDriver } from '../support/NodeSqliteDriver';
import { Repository, migrate, MIGRATIONS, SCHEMA_VERSION, dao } from '../../src/storage';
import { tmpDbFile } from '../support/single';

describe('NF-13: migraties', () => {
  it('NF-13: lege database → huidige schemaversie; tweede keer is een no-op', async () => {
    const repo = new Repository(new NodeSqliteDriver());
    expect(await migrate(repo)).toBe(SCHEMA_VERSION);
    expect(await migrate(repo)).toBe(SCHEMA_VERSION);
    expect(await repo.read((r) => dao.getMeta(r, 'schema_version'))).toBe(String(SCHEMA_VERSION));
  });

  it('NF-13: v1-database met data migreert naar een nieuwere versie zonder dataverlies', async () => {
    const file = tmpDbFile();
    const drv = new NodeSqliteDriver(file);
    const repo = new Repository(drv);
    await migrate(repo, MIGRATIONS.slice(0, 1));
    await repo.tx(async (tx) => {
      await dao.insertList(tx, { id: 'L1', regs: { n: ['Oud', '0'.repeat(32)] }, position: 0 });
      await tx.run("INSERT INTO items(list_id,id,regs,del_hlc,max_hlc,deleted,checked,category,name,name_norm,added_hlc) VALUES ('L1','AAAAAAAAAAAAAAAA','{}',NULL,'',0,0,'overig','x','x','')");
    });
    drv.hardClose();
    // Een hypothetische migratie 2 die een kolom toevoegt.
    const v2 = [...MIGRATIONS, async (tx: Parameters<(typeof MIGRATIONS)[0]>[0]) => tx.exec('ALTER TABLE lists ADD COLUMN color TEXT')];
    const repo2 = new Repository(new NodeSqliteDriver(file));
    expect(await migrate(repo2, v2)).toBe(MIGRATIONS.length + 1);
    const lists = await repo2.read((r) => dao.loadLists(r));
    expect(lists.map((l) => l.name)).toEqual(['Oud']);
    const n = await repo2.read((r) => r.get<{ n: number }>('SELECT COUNT(*) AS n FROM items'));
    expect(n?.n).toBe(1);
  });

  it('NF-13: een mislukte migratie wordt teruggedraaid (eigen transactie)', async () => {
    const repo = new Repository(new NodeSqliteDriver());
    await migrate(repo);
    const bad = [...MIGRATIONS, async (tx: Parameters<(typeof MIGRATIONS)[0]>[0]) => {
      await tx.exec('CREATE TABLE tmp_x (a)');
      throw new Error('kapot');
    }];
    await expect(migrate(repo, bad)).rejects.toThrow('kapot');
    expect(await repo.read((r) => dao.getMeta(r, 'schema_version'))).toBe(String(SCHEMA_VERSION));
    const t = await repo.read((r) => r.all("SELECT name FROM sqlite_master WHERE name='tmp_x'"));
    expect(t).toHaveLength(0);
  });
});
