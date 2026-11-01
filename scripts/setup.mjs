// Tek seferlik kurulum:  npm run setup -- kullanici-adi/depo-adi
// 1) Masaüstü güncellemeleri için imza anahtarı üretir (.tauri/ klasörüne, git'e girmez)
// 2) tauri.conf.json'a açık anahtarı ve güncelleme adresini yazar
// 3) gh CLI kuruluysa GitHub Secrets'ı otomatik ekler, değilse ne ekleyeceğini yazdırır
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const repo = process.argv[2];
if (!repo || !repo.includes('/')) {
  console.error('Kullanım: npm run setup -- <github-kullanici>/<depo>   örn: npm run setup -- stag/productivity-vault');
  process.exit(1);
}
const [owner, name] = repo.split('/');

mkdirSync('.tauri', { recursive: true });
const keyPath = '.tauri/vault.key';
if (!existsSync(keyPath)) {
  console.log('🔑 İmza anahtarı üretiliyor…');
  execSync(`npx tauri signer generate --ci -p "" -w ${keyPath}`, { stdio: 'inherit' });
} else {
  console.log('🔑 Mevcut anahtar kullanılıyor:', keyPath);
}
const pub = readFileSync(keyPath + '.pub', 'utf8').trim();
const priv = readFileSync(keyPath, 'utf8').trim();

const confPath = 'src-tauri/tauri.conf.json';
const conf = JSON.parse(readFileSync(confPath, 'utf8'));
conf.plugins.updater.pubkey = pub;
conf.plugins.updater.endpoints = [`https://github.com/${owner}/${name}/releases/latest/download/latest.json`];
writeFileSync(confPath, JSON.stringify(conf, null, 2) + '\n');
console.log('✅ tauri.conf.json güncellendi');

// Anahtar şifresiz üretildi; şifre secret'ı gerekmez.
const secrets = { TAURI_SIGNING_PRIVATE_KEY: priv };
let gh = false;
try {
  execSync('gh auth status', { stdio: 'ignore' });
  gh = true;
} catch {
  /* gh yok */
}
if (gh) {
  for (const [k, v] of Object.entries(secrets)) {
    execSync(`gh secret set ${k} --repo ${repo}`, { input: v });
    console.log('✅ Secret eklendi:', k);
  }
} else {
  console.log('\nGitHub > depo > Settings > Secrets and variables > Actions > New repository secret:');
  console.log('  TAURI_SIGNING_PRIVATE_KEY          = .tauri/vault.key dosyasının içeriği');
}
console.log('\nAyrıca eşitleme için: VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY secret\'larını ekle (README > Supabase).');
console.log('⚠️  .tauri/vault.key dosyasını yedekle! Kaybolursa eski kurulumlar güncelleme alamaz.');
