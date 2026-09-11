// Wipes every controller from the backend.
//
// Usage:
//   node tools/wipe-controllers.mjs          # dry-run, lists targets
//   node tools/wipe-controllers.mjs --yes    # actually delete
//   BACKEND=http://localhost:4010 node tools/wipe-controllers.mjs --yes
//
// Pre-reqs:
//   • Backend running on $BACKEND (default http://localhost:4010)
//   • DB up (postgres / pglite-bridge)
//
// What it does:
//   1. GET /controllers — list every controller in the catalog
//   2. For each, DELETE /controller-manager/controllers/<id>
//   3. FK cascade in the DB cleans up credentials / events; the rest
//      (detectors, alarms, deployments, etc.) get controllerId=NULL.

const BACKEND = process.env.BACKEND ?? "http://localhost:4010";
const DRY_RUN = !process.argv.includes("--yes");

async function main() {
  console.log(`[wipe-controllers] backend=${BACKEND} dry-run=${DRY_RUN}`);

  const listRes = await fetch(`${BACKEND}/controllers`);
  if (!listRes.ok) {
    console.error(`[wipe-controllers] GET /controllers → ${listRes.status}`);
    process.exit(1);
  }
  const list = await listRes.json();
  if (!Array.isArray(list) || list.length === 0) {
    console.log("[wipe-controllers] nothing to delete");
    return;
  }

  console.log(`[wipe-controllers] ${list.length} controllers found:`);
  for (const c of list) {
    console.log(
      `  - ${c.id}  code=${c.code ?? "?"}  status=${c.status ?? "?"}  intersection=${c.intersectionId ?? "—"}`,
    );
  }

  if (DRY_RUN) {
    console.log("\n[wipe-controllers] dry-run only — re-run with --yes to delete");
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const c of list) {
    const res = await fetch(
      `${BACKEND}/controller-manager/controllers/${c.id}`,
      { method: "DELETE" },
    );
    if (res.ok || res.status === 204) {
      console.log(`  ✓ deleted ${c.id} (${c.code ?? "?"})`);
      ok += 1;
    } else {
      const body = await res.text().catch(() => "");
      console.log(`  ✗ failed ${c.id}: ${res.status} ${body.slice(0, 200)}`);
      fail += 1;
    }
  }
  console.log(`\n[wipe-controllers] done — ${ok} deleted, ${fail} failed`);
}

main().catch((err) => {
  console.error("[wipe-controllers] crashed:", err);
  process.exit(1);
});
