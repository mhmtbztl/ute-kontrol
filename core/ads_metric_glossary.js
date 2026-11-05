// Reklam metrik sözlüğü — tek kaynak (Aşama 4, 05.11.2026).
// Ekrandaki ipuçları, metrik seçici ve ChatGPT istemi AYNI metni kullanır;
// türetilen metriğin formülü de burada durur, ekran kendi oranını hesaplamaz.
// Adlar Meta Reklam Yöneticisi'nin Türkçe arayüzüyle aynıdır ki kullanıcı
// iki ekran arasında aynı kelimeyi görsün.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AdsMetricGlossary = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const round = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  // Pay ya da payda ölçülmediyse ya da payda 0 ise sonuç null: "—" yazılır (§3.6).
  const ratio = (top, bottom, scale = 1) => (top === null || top === undefined || !(Number(bottom) > 0)) ? null : round(Number(top) / Number(bottom) * scale);

  const GROUPS = Object.freeze([
    { id: 'results', label: 'Sonuçlar ve harcama' },
    { id: 'delivery', label: 'Dağıtım' },
    { id: 'engagement', label: 'Etkileşim' },
    { id: 'messaging', label: 'Mesaj ve arama' },
    { id: 'lexbnb', label: 'Lexbnb talep' },
    { id: 'custom', label: 'Özel' }
  ]);

  // good: 'UP' artış iyi, 'DOWN' düşüş iyi, null yönü bağlama göre (harcama, sıklık).
  // unit: TRY | COUNT | PCT | RATIO. base: dosyadan gelen sayaç; değilse formülle türetilir.
  const METRICS = Object.freeze([
    { key: 'spend', label: 'Harcanan tutar', group: 'results', unit: 'TRY', good: null, base: true, metaColumn: 'Harcanan Tutar (TRY)',
      short: 'Seçili dönemde reklama ödenen para. Finans\'ta "Reklam" gideri olarak görünür.' },
    { key: 'results', label: 'Sonuçlar', group: 'results', unit: 'COUNT', good: 'UP', base: true, metaColumn: 'Sonuçlar',
      short: 'Kampanyanın hedeflediği eylemin kaç kez gerçekleştiği (mesaj, profil ziyareti, sayfa görüntüleme…). Türü "Sonuç göstergesi" söyler.' },
    { key: 'costPerResult', label: 'Sonuç başına ücret', group: 'results', unit: 'TRY', good: 'DOWN', formula: 'Harcanan tutar ÷ Sonuçlar',
      short: 'Bir sonucun ortalama maliyeti. Aynı türde sonuç üreten kampanyaları karşılaştırmanın ana ölçüsü.',
      compute: t => ratio(t.spend, t.results) },
    { key: 'impressions', label: 'Gösterim', group: 'delivery', unit: 'COUNT', good: 'UP', base: true, metaColumn: 'Gösterim',
      short: 'Reklamın ekranda kaç kez gösterildiği. Aynı kişi birden çok kez sayılabilir.' },
    { key: 'reach', label: 'Erişim', group: 'delivery', unit: 'COUNT', good: 'UP', base: true, metaColumn: 'Erişim',
      short: 'Reklamı en az bir kez gören tekil kişi sayısı. Farklı günlerin ya da kampanyaların erişimi toplanamaz; bu yüzden birden çok dönemde "—" görünür.' },
    { key: 'frequency', label: 'Sıklık', group: 'delivery', unit: 'RATIO', good: null, formula: 'Gösterim ÷ Erişim',
      short: 'Bir kişinin reklamı ortalama kaç kez gördüğü. 3\'ün üstü genelde aynı kişilere fazla gösterildiğine (reklam yorgunluğu) işaret eder.',
      compute: t => ratio(t.impressions, t.reach) },
    { key: 'cpm', label: 'BGBM (1.000 gösterim başına ücret)', group: 'delivery', unit: 'TRY', good: 'DOWN', formula: 'Harcanan tutar ÷ Gösterim × 1.000',
      short: 'Reklamı 1.000 kez göstermenin maliyeti. Yükselmesi rekabetin ya da hedef kitlenin pahalılaştığını gösterebilir.',
      compute: t => ratio(t.spend, t.impressions, 1000) },
    { key: 'clicks', label: 'Bağlantı tıklamaları', group: 'engagement', unit: 'COUNT', good: 'UP', base: true, metaColumn: 'Bağlantı Tıklamaları',
      short: 'Reklamdaki bağlantıya (web sitesi, WhatsApp, profil) yapılan tıklama sayısı.' },
    { key: 'ctr', label: 'TO (tıklama oranı)', group: 'engagement', unit: 'PCT', good: 'UP', formula: 'Bağlantı tıklamaları ÷ Gösterim × 100',
      short: 'Reklamı görenlerin yüzde kaçının tıkladığı. Görsel ve metnin ilgi çekip çekmediğinin ölçüsü.',
      compute: t => ratio(t.clicks, t.impressions, 100) },
    { key: 'cpc', label: 'TBM (tıklama başına ücret)', group: 'engagement', unit: 'TRY', good: 'DOWN', formula: 'Harcanan tutar ÷ Bağlantı tıklamaları',
      short: 'Bir tıklamanın ortalama maliyeti.',
      compute: t => ratio(t.spend, t.clicks) },
    { key: 'messages', label: 'Mesajlaşma başlatma', group: 'messaging', unit: 'COUNT', good: 'UP', base: true, metaColumn: 'Sonuçlar (mesaj hedefli kampanya)',
      short: 'Reklamdan WhatsApp, Instagram ya da Messenger\'da başlayan sohbet sayısı.' },
    { key: 'costPerMessage', label: 'Mesaj başına ücret', group: 'messaging', unit: 'TRY', good: 'DOWN', formula: 'Harcanan tutar ÷ Mesajlaşma başlatma',
      short: 'Bir sohbeti başlatmanın ortalama maliyeti. Verimlilik hedefinizle karşılaştırılır.',
      compute: t => ratio(t.messageSpend ?? t.spend, t.messages) },
    { key: 'calls', label: 'Arama', group: 'messaging', unit: 'COUNT', good: 'UP', base: true, metaColumn: 'Sonuçlar (arama hedefli kampanya)',
      short: 'Reklamdaki "Ara" düğmesiyle yapılan arama sayısı.' },
    { key: 'costPerCall', label: 'Arama başına ücret', group: 'messaging', unit: 'TRY', good: 'DOWN', formula: 'Harcanan tutar ÷ Arama',
      short: 'Bir aramanın ortalama maliyeti.',
      compute: t => ratio(t.callSpend ?? t.spend, t.calls) },
    { key: 'leads', label: 'Talep (Lexbnb)', group: 'lexbnb', unit: 'COUNT', good: 'UP', base: true, metaColumn: null,
      short: 'Lexbnb\'ye kaynağı Instagram/Facebook reklamı olarak girilen talep sayısı. Kanal düzeyindedir: hangi kampanyadan geldiği bilinmez.' },
    { key: 'costPerLead', label: 'Talep başına ücret', group: 'lexbnb', unit: 'TRY', good: 'DOWN', formula: 'Harcanan tutar ÷ Talep',
      short: 'Lexbnb\'ye düşen bir talebin ortalama reklam maliyeti (kanal düzeyi).',
      compute: t => ratio(t.spend, t.leads) },
    { key: 'messageToLead', label: 'Mesaj → talep oranı', group: 'lexbnb', unit: 'PCT', good: 'UP', formula: 'Talep ÷ Mesajlaşma başlatma × 100',
      short: 'Başlayan sohbetlerin yüzde kaçının Lexbnb\'ye talep olarak girildiği. Düşükse sohbetler satışa dönmüyor ya da talepler kaydedilmiyor olabilir.',
      compute: t => ratio(t.leads, t.messages, 100) }
  ]);

  const BY_KEY = Object.freeze(Object.fromEntries(METRICS.map(metric => [metric.key, metric])));
  const BASE_KEYS = Object.freeze(METRICS.filter(metric => metric.base).map(metric => metric.key));
  // Metrik seçicinin ilk açılıştaki seçimi: yeni başlayan biri için en anlamlı altı ölçü.
  const DEFAULT_VISIBLE = Object.freeze(['spend', 'results', 'costPerResult', 'impressions', 'ctr', 'costPerMessage']);

  function get(key) { return BY_KEY[key] || null; }

  // Taban toplamlardan bütün türetilen metrikler; ölçülemeyen null kalır.
  function derive(totals = {}) {
    const out = {};
    METRICS.forEach(metric => {
      out[metric.key] = metric.compute ? metric.compute(totals) : (totals[metric.key] === undefined ? null : totals[metric.key]);
    });
    return out;
  }

  // Önceki döneme göre yüzde değişim ve "iyi mi" yönü. Önceki 0 ya da ölçülmediyse null.
  function compare(key, current, previous) {
    const metric = get(key);
    if (current === null || current === undefined || previous === null || previous === undefined || Number(previous) === 0) return { pct: null, tone: null };
    const pct = round((Number(current) - Number(previous)) / Math.abs(Number(previous)) * 100);
    if (!metric || !metric.good || pct === 0) return { pct, tone: 'NEUTRAL' };
    const better = metric.good === 'UP' ? pct > 0 : pct < 0;
    return { pct, tone: better ? 'GOOD' : 'BAD' };
  }

  function format(key, value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    const unit = (get(key) || {}).unit;
    const n = Number(value);
    if (unit === 'TRY') return `₺${n.toLocaleString('tr-TR', { maximumFractionDigits: n < 100 ? 2 : 0 })}`;
    if (unit === 'PCT') return `%${n.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;
    if (unit === 'RATIO') return n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
    return n.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  }

  return { GROUPS, METRICS, BASE_KEYS, DEFAULT_VISIBLE, get, derive, compare, format, ratio };
});
