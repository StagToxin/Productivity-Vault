// Yeni sürüm çıkar:  npm run release -- patch | minor | major | 1.4.0
// Sürüm numarasını her yerde günceller, commit + etiket atar ve push'lar.
// GitHub Actions gerisini halleder: web sürümü + Windows/macOS/Linux kurulumları + otomatik güncelleme.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const arg = process.argv[2] ?? 'patch';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const [ma, mi, pa] = pkg.version.split('.').map(Number);
const next =
  arg === 'major' ? `${ma + 1}.0.0` : arg === 'minor' ? `${ma}.${mi + 1}.0` : arg === 'patch' ? `${ma}.${mi}.${pa + 1}` : arg;
if (!/^\d+\.\d+\.\d+$/.test(next)) {
  console.error('Geçersiz sürüm:', next);
  process.exit(1);
}

const conf = readFileSync('src-tauri/tauri.conf.json', 'utf8');
if (conf.includes('REPLACE_WITH_PUBLIC_KEY')) {
  console.error('Önce kurulumu çalıştır:  npm run setup -- <kullanici>/<depo>');
  process.exit(1);
}

const sh = (c) => execSync(c, { stdio: 'inherit' });
sh('npm test');
pkg.version = next;
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8').replace(/^version = ".*"$/m, `version = "${next}"`);
writeFileSync('src-tauri/Cargo.toml', cargo);
sh('npm install --package-lock-only --ignore-scripts');

sh('git add -A');
sh(`git commit -m "Sürüm v${next}"`);
sh(`git tag v${next}`);
sh('git push');
sh(`git push origin v${next}`);
console.log(`\n🚀 v${next} gönderildi. GitHub > Actions sekmesinden ilerlemeyi izleyebilirsin (~10-15 dk).`);
