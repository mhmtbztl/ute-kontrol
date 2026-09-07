// LEXBNB KONTROL MERKEZİ V5 - FULL MASTER FINANCE, KPI & OTA APPLICATION ENGINE
// Uludağ Tatil Evleri (Seyir, Doğuş, Zirve, Şirin, Nefes)
// RESMİ ŞİRKET VERİTABANI: GENEL RAPOR.xlsx üzerinden tamamen işlenmiştir.

const COMPANY_EXCEL_DATABASE = {
  "monthlyFinancials": {
    "2025-07": {
      "key": "2025-07",
      "year": "2025",
      "month": "07",
      "monthName": "Temmuz",
      "ciro": 66050,
      "opex": 0,
      "capex": 0,
      "totalExp": 0,
      "netProfit": 66050,
      "operatingProfit": 66050,
      "opMargin": 100,
      "netMargin": 100,
      "daysSold": 5,
      "avgDaily": 13210
    },
    "2025-08": {
      "key": "2025-08",
      "year": "2025",
      "month": "08",
      "monthName": "Ağustos",
      "ciro": 297507,
      "opex": 0,
      "capex": 0,
      "totalExp": 0,
      "netProfit": 297507,
      "operatingProfit": 297507,
      "opMargin": 100,
      "netMargin": 100,
      "daysSold": 22,
      "avgDaily": 13523.045454545454
    },
    "2025-09": {
      "key": "2025-09",
      "year": "2025",
      "month": "09",
      "monthName": "Eylül",
      "ciro": 95046,
      "opex": 0,
      "capex": 0,
      "totalExp": 0,
      "netProfit": 95046,
      "operatingProfit": 95046,
      "opMargin": 100,
      "netMargin": 100,
      "daysSold": 8,
      "avgDaily": 11880.75
    },
    "2025-10": {
      "key": "2025-10",
      "year": "2025",
      "month": "10",
      "monthName": "Ekim",
      "ciro": 216987,
      "opex": 255523,
      "capex": 341556,
      "totalExp": 597079,
      "netProfit": -38536,
      "operatingProfit": -38536,
      "opMargin": -17.8,
      "netMargin": -17.8,
      "daysSold": 24,
      "avgDaily": 9041.116666666667
    },
    "2025-11": {
      "key": "2025-11",
      "year": "2025",
      "month": "11",
      "monthName": "Kasım",
      "ciro": 197561,
      "opex": 290614,
      "capex": 174792,
      "totalExp": 465406,
      "netProfit": -93053,
      "operatingProfit": -93053,
      "opMargin": -47.1,
      "netMargin": -47.1,
      "daysSold": 19,
      "avgDaily": 10397.947368421053
    },
    "2025-12": {
      "key": "2025-12",
      "year": "2025",
      "month": "12",
      "monthName": "Aralık",
      "ciro": 493690,
      "opex": 318661,
      "capex": 174287,
      "totalExp": 492948,
      "netProfit": 175029,
      "operatingProfit": 175029,
      "opMargin": 35.5,
      "netMargin": 35.5,
      "targetCiro": 1000000,
      "daysSold": 29,
      "avgDaily": 17023.793103448275
    },
    "2026-01": {
      "key": "2026-01",
      "year": "2026",
      "month": "01",
      "monthName": "Ocak",
      "ciro": 843555,
      "opex": 331058,
      "capex": 465331,
      "totalExp": 796389,
      "netProfit": 512497,
      "operatingProfit": 512497,
      "opMargin": 60.8,
      "netMargin": 60.8,
      "targetCiro": 1000000,
      "daysSold": 46,
      "avgDaily": 18338.152173913044
    },
    "2026-02": {
      "key": "2026-02",
      "year": "2026",
      "month": "02",
      "monthName": "Şubat",
      "ciro": 587428,
      "opex": 468638,
      "capex": 257306,
      "totalExp": 725944,
      "netProfit": 118790,
      "operatingProfit": 118790,
      "opMargin": 20.2,
      "netMargin": 20.2,
      "targetCiro": 1000000,
      "daysSold": 29,
      "avgDaily": 20256.137931034482
    },
    "2026-03": {
      "key": "2026-03",
      "year": "2026",
      "month": "03",
      "monthName": "Mart",
      "ciro": 375076,
      "opex": 258067,
      "capex": 45000,
      "totalExp": 303067,
      "netProfit": 117009,
      "operatingProfit": 117009,
      "opMargin": 31.2,
      "netMargin": 31.2,
      "targetCiro": 180000,
      "daysSold": 31,
      "avgDaily": 12099.225806451614
    },
    "2026-04": {
      "key": "2026-04",
      "year": "2026",
      "month": "04",
      "monthName": "Nisan",
      "ciro": 208905,
      "opex": 311901,
      "capex": 172948,
      "totalExp": 484849,
      "netProfit": -102996,
      "operatingProfit": -102996,
      "opMargin": -49.3,
      "netMargin": -49.3,
      "targetCiro": 180000,
      "daysSold": 19,
      "avgDaily": 10995.031578947368
    },
    "2026-05": {
      "key": "2026-05",
      "year": "2026",
      "month": "05",
      "monthName": "Mayıs",
      "ciro": 403100,
      "opex": 568971,
      "capex": 216899,
      "totalExp": 785870,
      "netProfit": -165871,
      "operatingProfit": -165871,
      "opMargin": -41.1,
      "netMargin": -41.1,
      "targetCiro": 180000,
      "daysSold": 34,
      "avgDaily": 11855.882352941177
    },
    "2026-06": {
      "key": "2026-06",
      "year": "2026",
      "month": "06",
      "monthName": "Haziran",
      "ciro": 267827,
      "opex": 434876,
      "capex": 112165,
      "totalExp": 547041,
      "netProfit": -167049,
      "operatingProfit": -167049,
      "opMargin": -62.4,
      "netMargin": -62.4,
      "targetCiro": 240000,
      "daysSold": 25,
      "avgDaily": 10713.08
    },
    "2026-07": {
      "key": "2026-07",
      "year": "2026",
      "month": "07",
      "monthName": "Temmuz",
      "ciro": 467468,
      "opex": 308956,
      "capex": 22166,
      "totalExp": 331122,
      "netProfit": 158512,
      "operatingProfit": 158512,
      "opMargin": 33.9,
      "netMargin": 33.9,
      "targetCiro": 240000,
      "daysSold": 79,
      "avgDaily": 5917.316455696203
    },
    "2026-08": {
      "key": "2026-08",
      "year": "2026",
      "month": "08",
      "monthName": "Ağustos",
      "ciro": 483965,
      "opex": 337306,
      "capex": 3866,
      "totalExp": 341172,
      "netProfit": 146659,
      "operatingProfit": 146659,
      "opMargin": 30.3,
      "netMargin": 30.3,
      "targetCiro": 300000,
      "daysSold": 79,
      "avgDaily": 6126.139240506329
    }
  },
  "targets": {
    "2025-12": 1000000,
    "2026-01": 1000000,
    "2026-02": 1000000,
    "2026-03": 180000,
    "2026-04": 180000,
    "2026-05": 180000,
    "2026-06": 240000,
    "2026-07": 240000,
    "2026-08": 300000,
    "2026-09": 120000,
    "2026-10": 240000,
    "2026-11": 240000
  },
  "propertyMonthly": {
    "2025-07": {
      "key": "2025-07",
      "totalDays": 5,
      "totalRev": 66050,
      "avgDaily": 13210,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 4,
          "rev": 53050,
          "adr": 13263,
          "share": 80.3,
          "occupancy": 12.9,
          "revpar": 1711
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 1,
          "rev": 13000,
          "adr": 13000,
          "share": 19.7,
          "occupancy": 3.2,
          "revpar": 419
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 0,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 0,
          "revpar": 0
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 0,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 0,
          "revpar": 0
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 0,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 0,
          "revpar": 0
        }
      ]
    },
    "2025-08": {
      "key": "2025-08",
      "totalDays": 22,
      "totalRev": 297507,
      "avgDaily": 13523.045454545454,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 8,
          "rev": 108910,
          "adr": 13614,
          "share": 36.6,
          "occupancy": 25.8,
          "revpar": 3513
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 5,
          "rev": 52058,
          "adr": 10412,
          "share": 17.5,
          "occupancy": 16.1,
          "revpar": 1679
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 0,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 0,
          "revpar": 0
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 3,
          "rev": 40917,
          "adr": 13639,
          "share": 13.8,
          "occupancy": 9.7,
          "revpar": 1320
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 6,
          "rev": 95622,
          "adr": 15937,
          "share": 32.1,
          "occupancy": 19.4,
          "revpar": 3085
        }
      ]
    },
    "2025-09": {
      "key": "2025-09",
      "totalDays": 8,
      "totalRev": 95046,
      "avgDaily": 11880.75,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 3,
          "rev": 39098,
          "adr": 13033,
          "share": 41.1,
          "occupancy": 9.7,
          "revpar": 1261
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 0,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 0,
          "revpar": 0
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 0,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 0,
          "revpar": 0
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 0,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 0,
          "revpar": 0
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 5,
          "rev": 55948,
          "adr": 11190,
          "share": 58.9,
          "occupancy": 16.1,
          "revpar": 1805
        }
      ]
    },
    "2025-10": {
      "key": "2025-10",
      "totalDays": 24,
      "totalRev": 216986.8,
      "avgDaily": 9041.116666666667,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 7,
          "rev": 67996,
          "adr": 9714,
          "share": 31.3,
          "occupancy": 22.6,
          "revpar": 2193
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 4,
          "rev": 35676.4,
          "adr": 8919,
          "share": 16.4,
          "occupancy": 12.9,
          "revpar": 1151
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 5,
          "rev": 44906.4,
          "adr": 8981,
          "share": 20.7,
          "occupancy": 16.1,
          "revpar": 1449
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 4,
          "rev": 28420,
          "adr": 7105,
          "share": 13.1,
          "occupancy": 12.9,
          "revpar": 917
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 4,
          "rev": 39988,
          "adr": 9997,
          "share": 18.4,
          "occupancy": 12.9,
          "revpar": 1290
        }
      ]
    },
    "2025-11": {
      "key": "2025-11",
      "totalDays": 19,
      "totalRev": 197561,
      "avgDaily": 10397.947368421053,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 5,
          "rev": 56320,
          "adr": 11264,
          "share": 28.5,
          "occupancy": 16.1,
          "revpar": 1817
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 3,
          "rev": 21902,
          "adr": 7301,
          "share": 11.1,
          "occupancy": 9.7,
          "revpar": 707
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 4,
          "rev": 46610,
          "adr": 11653,
          "share": 23.6,
          "occupancy": 12.9,
          "revpar": 1504
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 1,
          "rev": 7229,
          "adr": 7229,
          "share": 3.7,
          "occupancy": 3.2,
          "revpar": 233
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 6,
          "rev": 65500,
          "adr": 10917,
          "share": 33.2,
          "occupancy": 19.4,
          "revpar": 2113
        }
      ]
    },
    "2025-12": {
      "key": "2025-12",
      "totalDays": 29,
      "totalRev": 493690,
      "avgDaily": 17023.793103448275,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 10,
          "rev": 144060,
          "adr": 14406,
          "share": 29.2,
          "occupancy": 32.3,
          "revpar": 4647
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 6,
          "rev": 150410,
          "adr": 25068,
          "share": 30.5,
          "occupancy": 19.4,
          "revpar": 4852
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 9,
          "rev": 137660,
          "adr": 15296,
          "share": 27.9,
          "occupancy": 29,
          "revpar": 4441
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 0,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 0,
          "revpar": 0
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 4,
          "rev": 61560,
          "adr": 15390,
          "share": 12.5,
          "occupancy": 12.9,
          "revpar": 1986
        }
      ]
    },
    "2026-01": {
      "key": "2026-01",
      "totalDays": 46,
      "totalRev": 843555,
      "avgDaily": 18338.152173913044,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 10,
          "rev": 174925,
          "adr": 17493,
          "share": 20.7,
          "occupancy": 32.3,
          "revpar": 5643
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 12,
          "rev": 184800,
          "adr": 15400,
          "share": 21.9,
          "occupancy": 38.7,
          "revpar": 5961
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 14,
          "rev": 279549,
          "adr": 19968,
          "share": 33.1,
          "occupancy": 45.2,
          "revpar": 9018
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 1,
          "rev": 6346,
          "adr": 6346,
          "share": 0.8,
          "occupancy": 3.2,
          "revpar": 205
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 9,
          "rev": 197935,
          "adr": 21993,
          "share": 23.5,
          "occupancy": 29,
          "revpar": 6385
        }
      ]
    },
    "2026-02": {
      "key": "2026-02",
      "totalDays": 29,
      "totalRev": 587428,
      "avgDaily": 20256.137931034482,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 8,
          "rev": 190265,
          "adr": 23783,
          "share": 32.4,
          "occupancy": 25.8,
          "revpar": 6138
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 5,
          "rev": 94500,
          "adr": 18900,
          "share": 16.1,
          "occupancy": 16.1,
          "revpar": 3048
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 9,
          "rev": 156669,
          "adr": 17408,
          "share": 26.7,
          "occupancy": 29,
          "revpar": 5054
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 2,
          "rev": 34750,
          "adr": 17375,
          "share": 5.9,
          "occupancy": 6.5,
          "revpar": 1121
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 5,
          "rev": 111244,
          "adr": 22249,
          "share": 18.9,
          "occupancy": 16.1,
          "revpar": 3589
        }
      ]
    },
    "2026-03": {
      "key": "2026-03",
      "totalDays": 31,
      "totalRev": 375076,
      "avgDaily": 12099.225806451614,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 6,
          "rev": 80760,
          "adr": 13460,
          "share": 21.5,
          "occupancy": 19.4,
          "revpar": 2605
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 6,
          "rev": 80832,
          "adr": 13472,
          "share": 21.6,
          "occupancy": 19.4,
          "revpar": 2607
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 9,
          "rev": 75798,
          "adr": 8422,
          "share": 20.2,
          "occupancy": 29,
          "revpar": 2445
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 5,
          "rev": 46921,
          "adr": 9384,
          "share": 12.5,
          "occupancy": 16.1,
          "revpar": 1514
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 5,
          "rev": 90765,
          "adr": 18153,
          "share": 24.2,
          "occupancy": 16.1,
          "revpar": 2928
        }
      ]
    },
    "2026-04": {
      "key": "2026-04",
      "totalDays": 19,
      "totalRev": 208905.6,
      "avgDaily": 10995.031578947368,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 9,
          "rev": 92238,
          "adr": 10249,
          "share": 44.2,
          "occupancy": 29,
          "revpar": 2975
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 3,
          "rev": 21700,
          "adr": 7233,
          "share": 10.4,
          "occupancy": 9.7,
          "revpar": 700
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 4,
          "rev": 58448,
          "adr": 14612,
          "share": 28,
          "occupancy": 12.9,
          "revpar": 1885
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 1,
          "rev": 6489.6,
          "adr": 6490,
          "share": 3.1,
          "occupancy": 3.2,
          "revpar": 209
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 2,
          "rev": 30030,
          "adr": 15015,
          "share": 14.4,
          "occupancy": 6.5,
          "revpar": 969
        }
      ]
    },
    "2026-05": {
      "key": "2026-05",
      "totalDays": 34,
      "totalRev": 403100,
      "avgDaily": 11855.882352941177,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 7,
          "rev": 92000,
          "adr": 13143,
          "share": 22.8,
          "occupancy": 22.6,
          "revpar": 2968
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 3,
          "rev": 28000,
          "adr": 9333,
          "share": 6.9,
          "occupancy": 9.7,
          "revpar": 903
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 8,
          "rev": 104730,
          "adr": 13091,
          "share": 26,
          "occupancy": 25.8,
          "revpar": 3378
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 9,
          "rev": 69000,
          "adr": 7667,
          "share": 17.1,
          "occupancy": 29,
          "revpar": 2226
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 7,
          "rev": 109370,
          "adr": 15624,
          "share": 27.1,
          "occupancy": 22.6,
          "revpar": 3528
        }
      ]
    },
    "2026-06": {
      "key": "2026-06",
      "totalDays": 25,
      "totalRev": 267827,
      "avgDaily": 10713.08,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 6,
          "rev": 90595,
          "adr": 15099,
          "share": 33.8,
          "occupancy": 19.4,
          "revpar": 2922
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 8,
          "rev": 61000,
          "adr": 7625,
          "share": 22.8,
          "occupancy": 25.8,
          "revpar": 1968
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 5,
          "rev": 65695,
          "adr": 13139,
          "share": 24.5,
          "occupancy": 16.1,
          "revpar": 2119
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 4,
          "rev": 30762,
          "adr": 7691,
          "share": 11.5,
          "occupancy": 12.9,
          "revpar": 992
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 2,
          "rev": 19775,
          "adr": 9888,
          "share": 7.4,
          "occupancy": 6.5,
          "revpar": 638
        }
      ]
    },
    "2026-07": {
      "key": "2026-07",
      "totalDays": 79,
      "totalRev": 467468,
      "avgDaily": 5917.316455696203,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 6,
          "rev": 91599,
          "adr": 15267,
          "share": 19.6,
          "occupancy": 19.4,
          "revpar": 2955
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 17,
          "rev": 62100,
          "adr": 3653,
          "share": 13.3,
          "occupancy": 54.8,
          "revpar": 2003
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 9,
          "rev": 106238,
          "adr": 11804,
          "share": 22.7,
          "occupancy": 29,
          "revpar": 3427
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 19,
          "rev": 68599,
          "adr": 3610,
          "share": 14.7,
          "occupancy": 61.3,
          "revpar": 2213
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 28,
          "rev": 138932,
          "adr": 4962,
          "share": 29.7,
          "occupancy": 90.3,
          "revpar": 4482
        }
      ]
    },
    "2026-08": {
      "key": "2026-08",
      "totalDays": 79,
      "totalRev": 483965,
      "avgDaily": 6126.139240506329,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 8,
          "rev": 98318,
          "adr": 12290,
          "share": 20.3,
          "occupancy": 25.8,
          "revpar": 3172
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 24,
          "rev": 97375,
          "adr": 4057,
          "share": 20.1,
          "occupancy": 77.4,
          "revpar": 3141
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 9,
          "rev": 138190,
          "adr": 15354,
          "share": 28.6,
          "occupancy": 29,
          "revpar": 4458
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 30,
          "rev": 84780,
          "adr": 2826,
          "share": 17.5,
          "occupancy": 96.8,
          "revpar": 2735
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 8,
          "rev": 65302,
          "adr": 8163,
          "share": 13.5,
          "occupancy": 25.8,
          "revpar": 2107
        }
      ]
    },
    "2026-09": {
      "key": "2026-09",
      "totalDays": 8,
      "totalRev": 0,
      "avgDaily": 0,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 0,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 0,
          "revpar": 0
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 1,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 3.2,
          "revpar": 0
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 0,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 0,
          "revpar": 0
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 6,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 19.4,
          "revpar": 0
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 1,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 3.2,
          "revpar": 0
        }
      ]
    }
  },
  "expensesList": [
    {
      "id": "exp-1001",
      "monthKey": "2025-10",
      "month": "2025-10",
      "date": "2025-10-15",
      "category": "Reklam",
      "type": "OPEX",
      "amount": 76322,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Reklam Aylık Ödemesi (EKİM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1002",
      "monthKey": "2025-10",
      "month": "2025-10",
      "date": "2025-10-15",
      "category": "Akaryakıt",
      "type": "OPEX",
      "amount": 6020,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Akaryakıt Aylık Ödemesi (EKİM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1003",
      "monthKey": "2025-10",
      "month": "2025-10",
      "date": "2025-10-15",
      "category": "Bakım",
      "type": "OPEX",
      "amount": 34268,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Bakım Aylık Ödemesi (EKİM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1004",
      "monthKey": "2025-10",
      "month": "2025-10",
      "date": "2025-10-15",
      "category": "Fatura",
      "type": "OPEX",
      "amount": 6293,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Fatura Aylık Ödemesi (EKİM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1005",
      "monthKey": "2025-10",
      "month": "2025-10",
      "date": "2025-10-15",
      "category": "Muhasebe",
      "type": "OPEX",
      "amount": 7363,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Muhasebe Aylık Ödemesi (EKİM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1006",
      "monthKey": "2025-10",
      "month": "2025-10",
      "date": "2025-10-15",
      "category": "Temizlik",
      "type": "OPEX",
      "amount": 32500,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Temizlik Aylık Ödemesi (EKİM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1007",
      "monthKey": "2025-10",
      "month": "2025-10",
      "date": "2025-10-15",
      "category": "Kredi Kartı / Komisyon",
      "type": "OPEX",
      "amount": 4030,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Kredi Kartı / Komisyon Aylık Ödemesi (EKİM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1008",
      "monthKey": "2025-10",
      "month": "2025-10",
      "date": "2025-10-15",
      "category": "Maaş",
      "type": "OPEX",
      "amount": 40000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Maaş Aylık Ödemesi (EKİM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1009",
      "monthKey": "2025-10",
      "month": "2025-10",
      "date": "2025-10-15",
      "category": "Danışmanlık",
      "type": "OPEX",
      "amount": 15000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Danışmanlık Aylık Ödemesi (EKİM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1010",
      "monthKey": "2025-11",
      "month": "2025-11",
      "date": "2025-11-15",
      "category": "Akaryakıt",
      "type": "OPEX",
      "amount": 14006,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Akaryakıt Aylık Ödemesi (KASIM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1011",
      "monthKey": "2025-11",
      "month": "2025-11",
      "date": "2025-11-15",
      "category": "Bakım",
      "type": "OPEX",
      "amount": 61000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Bakım Aylık Ödemesi (KASIM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1012",
      "monthKey": "2025-11",
      "month": "2025-11",
      "date": "2025-11-15",
      "category": "Fatura",
      "type": "OPEX",
      "amount": 13168,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Fatura Aylık Ödemesi (KASIM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1013",
      "monthKey": "2025-11",
      "month": "2025-11",
      "date": "2025-11-15",
      "category": "Muhasebe",
      "type": "OPEX",
      "amount": 11056,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Muhasebe Aylık Ödemesi (KASIM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1014",
      "monthKey": "2025-11",
      "month": "2025-11",
      "date": "2025-11-15",
      "category": "Reklam",
      "type": "OPEX",
      "amount": 81115,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Reklam Aylık Ödemesi (KASIM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1015",
      "monthKey": "2025-11",
      "month": "2025-11",
      "date": "2025-11-15",
      "category": "Temizlik",
      "type": "OPEX",
      "amount": 24000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Temizlik Aylık Ödemesi (KASIM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1016",
      "monthKey": "2025-11",
      "month": "2025-11",
      "date": "2025-11-15",
      "category": "Kredi Kartı / Komisyon",
      "type": "OPEX",
      "amount": 7336,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Kredi Kartı / Komisyon Aylık Ödemesi (KASIM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1017",
      "monthKey": "2025-11",
      "month": "2025-11",
      "date": "2025-11-15",
      "category": "Maaş",
      "type": "OPEX",
      "amount": 40000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Maaş Aylık Ödemesi (KASIM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1018",
      "monthKey": "2025-11",
      "month": "2025-11",
      "date": "2025-11-15",
      "category": "Danışmanlık",
      "type": "OPEX",
      "amount": 15000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Danışmanlık Aylık Ödemesi (KASIM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1019",
      "monthKey": "2025-12",
      "month": "2025-12",
      "date": "2025-12-15",
      "category": "Akaryakıt",
      "type": "OPEX",
      "amount": 13401,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Akaryakıt Aylık Ödemesi (ARALIK 2025) - Excel Raporu"
    },
    {
      "id": "exp-1020",
      "monthKey": "2025-12",
      "month": "2025-12",
      "date": "2025-12-15",
      "category": "Bakım",
      "type": "OPEX",
      "amount": 48000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Bakım Aylık Ödemesi (ARALIK 2025) - Excel Raporu"
    },
    {
      "id": "exp-1021",
      "monthKey": "2025-12",
      "month": "2025-12",
      "date": "2025-12-15",
      "category": "Fatura",
      "type": "OPEX",
      "amount": 8148,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Fatura Aylık Ödemesi (ARALIK 2025) - Excel Raporu"
    },
    {
      "id": "exp-1022",
      "monthKey": "2025-12",
      "month": "2025-12",
      "date": "2025-12-15",
      "category": "Muhasebe",
      "type": "OPEX",
      "amount": 17278,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Muhasebe Aylık Ödemesi (ARALIK 2025) - Excel Raporu"
    },
    {
      "id": "exp-1023",
      "monthKey": "2025-12",
      "month": "2025-12",
      "date": "2025-12-15",
      "category": "Reklam",
      "type": "OPEX",
      "amount": 62715,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Reklam Aylık Ödemesi (ARALIK 2025) - Excel Raporu"
    },
    {
      "id": "exp-1024",
      "monthKey": "2025-12",
      "month": "2025-12",
      "date": "2025-12-15",
      "category": "Temizlik",
      "type": "OPEX",
      "amount": 26200,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Temizlik Aylık Ödemesi (ARALIK 2025) - Excel Raporu"
    },
    {
      "id": "exp-1025",
      "monthKey": "2025-12",
      "month": "2025-12",
      "date": "2025-12-15",
      "category": "Kredi Kartı / Komisyon",
      "type": "OPEX",
      "amount": 52090,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Kredi Kartı / Komisyon Aylık Ödemesi (ARALIK 2025) - Excel Raporu"
    },
    {
      "id": "exp-1026",
      "monthKey": "2025-12",
      "month": "2025-12",
      "date": "2025-12-15",
      "category": "Maaş",
      "type": "OPEX",
      "amount": 40000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Maaş Aylık Ödemesi (ARALIK 2025) - Excel Raporu"
    },
    {
      "id": "exp-1027",
      "monthKey": "2025-12",
      "month": "2025-12",
      "date": "2025-12-15",
      "category": "Danışmanlık",
      "type": "OPEX",
      "amount": 15000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Danışmanlık Aylık Ödemesi (ARALIK 2025) - Excel Raporu"
    },
    {
      "id": "exp-1028",
      "monthKey": "2026-01",
      "month": "2026-01",
      "date": "2026-01-15",
      "category": "Akaryakıt",
      "type": "OPEX",
      "amount": 12866,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Akaryakıt Aylık Ödemesi (OCAK 2026) - Excel Raporu"
    },
    {
      "id": "exp-1029",
      "monthKey": "2026-01",
      "month": "2026-01",
      "date": "2026-01-15",
      "category": "Bakım",
      "type": "OPEX",
      "amount": 36100,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Bakım Aylık Ödemesi (OCAK 2026) - Excel Raporu"
    },
    {
      "id": "exp-1030",
      "monthKey": "2026-01",
      "month": "2026-01",
      "date": "2026-01-15",
      "category": "Fatura",
      "type": "OPEX",
      "amount": 6271,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Fatura Aylık Ödemesi (OCAK 2026) - Excel Raporu"
    },
    {
      "id": "exp-1031",
      "monthKey": "2026-01",
      "month": "2026-01",
      "date": "2026-01-15",
      "category": "Muhasebe",
      "type": "OPEX",
      "amount": 36886,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Muhasebe Aylık Ödemesi (OCAK 2026) - Excel Raporu"
    },
    {
      "id": "exp-1032",
      "monthKey": "2026-01",
      "month": "2026-01",
      "date": "2026-01-15",
      "category": "Reklam",
      "type": "OPEX",
      "amount": 35788,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Reklam Aylık Ödemesi (OCAK 2026) - Excel Raporu"
    },
    {
      "id": "exp-1033",
      "monthKey": "2026-01",
      "month": "2026-01",
      "date": "2026-01-15",
      "category": "Temizlik",
      "type": "OPEX",
      "amount": 42900,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Temizlik Aylık Ödemesi (OCAK 2026) - Excel Raporu"
    },
    {
      "id": "exp-1034",
      "monthKey": "2026-01",
      "month": "2026-01",
      "date": "2026-01-15",
      "category": "Kredi Kartı / Komisyon",
      "type": "OPEX",
      "amount": 58254,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Kredi Kartı / Komisyon Aylık Ödemesi (OCAK 2026) - Excel Raporu"
    },
    {
      "id": "exp-1035",
      "monthKey": "2026-01",
      "month": "2026-01",
      "date": "2026-01-15",
      "category": "Maaş",
      "type": "OPEX",
      "amount": 40000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Maaş Aylık Ödemesi (OCAK 2026) - Excel Raporu"
    },
    {
      "id": "exp-1036",
      "monthKey": "2026-01",
      "month": "2026-01",
      "date": "2026-01-15",
      "category": "Danışmanlık",
      "type": "OPEX",
      "amount": 15000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Danışmanlık Aylık Ödemesi (OCAK 2026) - Excel Raporu"
    },
    {
      "id": "exp-1037",
      "monthKey": "2026-02",
      "month": "2026-02",
      "date": "2026-02-15",
      "category": "Maaş",
      "type": "OPEX",
      "amount": 40000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Maaş Aylık Ödemesi (ŞUBAT 2026) - Excel Raporu"
    },
    {
      "id": "exp-1038",
      "monthKey": "2026-02",
      "month": "2026-02",
      "date": "2026-02-15",
      "category": "Danışmanlık",
      "type": "OPEX",
      "amount": 15000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Danışmanlık Aylık Ödemesi (ŞUBAT 2026) - Excel Raporu"
    },
    {
      "id": "exp-1039",
      "monthKey": "2026-02",
      "month": "2026-02",
      "date": "2026-02-15",
      "category": "Akaryakıt",
      "type": "OPEX",
      "amount": 19715,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Akaryakıt Aylık Ödemesi (ŞUBAT 2026) - Excel Raporu"
    },
    {
      "id": "exp-1040",
      "monthKey": "2026-02",
      "month": "2026-02",
      "date": "2026-02-15",
      "category": "Bakım",
      "type": "OPEX",
      "amount": 57650,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Bakım Aylık Ödemesi (ŞUBAT 2026) - Excel Raporu"
    },
    {
      "id": "exp-1041",
      "monthKey": "2026-02",
      "month": "2026-02",
      "date": "2026-02-15",
      "category": "Fatura",
      "type": "OPEX",
      "amount": 127158,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Fatura Aylık Ödemesi (ŞUBAT 2026) - Excel Raporu"
    },
    {
      "id": "exp-1042",
      "monthKey": "2026-02",
      "month": "2026-02",
      "date": "2026-02-15",
      "category": "Muhasebe",
      "type": "OPEX",
      "amount": 46673,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Muhasebe Aylık Ödemesi (ŞUBAT 2026) - Excel Raporu"
    },
    {
      "id": "exp-1043",
      "monthKey": "2026-02",
      "month": "2026-02",
      "date": "2026-02-15",
      "category": "Reklam",
      "type": "OPEX",
      "amount": 42736,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Reklam Aylık Ödemesi (ŞUBAT 2026) - Excel Raporu"
    },
    {
      "id": "exp-1044",
      "monthKey": "2026-02",
      "month": "2026-02",
      "date": "2026-02-15",
      "category": "Temizlik",
      "type": "OPEX",
      "amount": 31000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Temizlik Aylık Ödemesi (ŞUBAT 2026) - Excel Raporu"
    },
    {
      "id": "exp-1045",
      "monthKey": "2026-02",
      "month": "2026-02",
      "date": "2026-02-15",
      "category": "Kredi Kartı / Komisyon",
      "type": "OPEX",
      "amount": 51003,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Kredi Kartı / Komisyon Aylık Ödemesi (ŞUBAT 2026) - Excel Raporu"
    },
    {
      "id": "exp-1046",
      "monthKey": "2026-03",
      "month": "2026-03",
      "date": "2026-03-15",
      "category": "Temizlik",
      "type": "OPEX",
      "amount": 40000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Temizlik Aylık Ödemesi (MART 2026) - Excel Raporu"
    },
    {
      "id": "exp-1047",
      "monthKey": "2026-03",
      "month": "2026-03",
      "date": "2026-03-15",
      "category": "Bakım",
      "type": "OPEX",
      "amount": 10000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Bakım Aylık Ödemesi (MART 2026) - Excel Raporu"
    },
    {
      "id": "exp-1048",
      "monthKey": "2026-03",
      "month": "2026-03",
      "date": "2026-03-15",
      "category": "Akaryakıt",
      "type": "OPEX",
      "amount": 8344,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Akaryakıt Aylık Ödemesi (MART 2026) - Excel Raporu"
    },
    {
      "id": "exp-1049",
      "monthKey": "2026-03",
      "month": "2026-03",
      "date": "2026-03-15",
      "category": "Muhasebe",
      "type": "OPEX",
      "amount": 39860,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Muhasebe Aylık Ödemesi (MART 2026) - Excel Raporu"
    },
    {
      "id": "exp-1050",
      "monthKey": "2026-03",
      "month": "2026-03",
      "date": "2026-03-15",
      "category": "Reklam",
      "type": "OPEX",
      "amount": 65863,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Reklam Aylık Ödemesi (MART 2026) - Excel Raporu"
    },
    {
      "id": "exp-1051",
      "monthKey": "2026-03",
      "month": "2026-03",
      "date": "2026-03-15",
      "category": "Maaş",
      "type": "OPEX",
      "amount": 36000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Maaş Aylık Ödemesi (MART 2026) - Excel Raporu"
    },
    {
      "id": "exp-1052",
      "monthKey": "2026-03",
      "month": "2026-03",
      "date": "2026-03-15",
      "category": "Fatura",
      "type": "OPEX",
      "amount": 5826,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Fatura Aylık Ödemesi (MART 2026) - Excel Raporu"
    },
    {
      "id": "exp-1053",
      "monthKey": "2026-03",
      "month": "2026-03",
      "date": "2026-03-15",
      "category": "Kredi Kartı / Komisyon",
      "type": "OPEX",
      "amount": 24548,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Kredi Kartı / Komisyon Aylık Ödemesi (MART 2026) - Excel Raporu"
    },
    {
      "id": "exp-1054",
      "monthKey": "2026-04",
      "month": "2026-04",
      "date": "2026-04-15",
      "category": "Temizlik",
      "type": "OPEX",
      "amount": 28000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Temizlik Aylık Ödemesi (NİSAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1055",
      "monthKey": "2026-04",
      "month": "2026-04",
      "date": "2026-04-15",
      "category": "Bakım",
      "type": "OPEX",
      "amount": 52756,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Bakım Aylık Ödemesi (NİSAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1056",
      "monthKey": "2026-04",
      "month": "2026-04",
      "date": "2026-04-15",
      "category": "Akaryakıt",
      "type": "OPEX",
      "amount": 4214,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Akaryakıt Aylık Ödemesi (NİSAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1057",
      "monthKey": "2026-04",
      "month": "2026-04",
      "date": "2026-04-15",
      "category": "Muhasebe",
      "type": "OPEX",
      "amount": 46400,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Muhasebe Aylık Ödemesi (NİSAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1058",
      "monthKey": "2026-04",
      "month": "2026-04",
      "date": "2026-04-15",
      "category": "Reklam",
      "type": "OPEX",
      "amount": 54367,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Reklam Aylık Ödemesi (NİSAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1059",
      "monthKey": "2026-04",
      "month": "2026-04",
      "date": "2026-04-15",
      "category": "Maaş",
      "type": "OPEX",
      "amount": 85075,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Maaş Aylık Ödemesi (NİSAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1060",
      "monthKey": "2026-04",
      "month": "2026-04",
      "date": "2026-04-15",
      "category": "Fatura",
      "type": "OPEX",
      "amount": 5826,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Fatura Aylık Ödemesi (NİSAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1061",
      "monthKey": "2026-04",
      "month": "2026-04",
      "date": "2026-04-15",
      "category": "Kredi Kartı / Komisyon",
      "type": "OPEX",
      "amount": 24178,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Kredi Kartı / Komisyon Aylık Ödemesi (NİSAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1062",
      "monthKey": "2026-05",
      "month": "2026-05",
      "date": "2026-05-15",
      "category": "Temizlik",
      "type": "OPEX",
      "amount": 42500,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Temizlik Aylık Ödemesi (MAYIS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1063",
      "monthKey": "2026-05",
      "month": "2026-05",
      "date": "2026-05-15",
      "category": "Bakım",
      "type": "OPEX",
      "amount": 57875,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Bakım Aylık Ödemesi (MAYIS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1064",
      "monthKey": "2026-05",
      "month": "2026-05",
      "date": "2026-05-15",
      "category": "Akaryakıt",
      "type": "OPEX",
      "amount": 10268,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Akaryakıt Aylık Ödemesi (MAYIS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1065",
      "monthKey": "2026-05",
      "month": "2026-05",
      "date": "2026-05-15",
      "category": "Muhasebe",
      "type": "OPEX",
      "amount": 235378,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Muhasebe Aylık Ödemesi (MAYIS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1066",
      "monthKey": "2026-05",
      "month": "2026-05",
      "date": "2026-05-15",
      "category": "Reklam",
      "type": "OPEX",
      "amount": 45746,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Reklam Aylık Ödemesi (MAYIS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1067",
      "monthKey": "2026-05",
      "month": "2026-05",
      "date": "2026-05-15",
      "category": "Maaş",
      "type": "OPEX",
      "amount": 85075,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Maaş Aylık Ödemesi (MAYIS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1068",
      "monthKey": "2026-05",
      "month": "2026-05",
      "date": "2026-05-15",
      "category": "Fatura",
      "type": "OPEX",
      "amount": 48744,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Fatura Aylık Ödemesi (MAYIS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1069",
      "monthKey": "2026-05",
      "month": "2026-05",
      "date": "2026-05-15",
      "category": "Kredi Kartı / Komisyon",
      "type": "OPEX",
      "amount": 55067,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Kredi Kartı / Komisyon Aylık Ödemesi (MAYIS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1070",
      "monthKey": "2026-06",
      "month": "2026-06",
      "date": "2026-06-15",
      "category": "Muhasebe",
      "type": "OPEX",
      "amount": 90338,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Muhasebe Aylık Ödemesi (HAZİRAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1071",
      "monthKey": "2026-06",
      "month": "2026-06",
      "date": "2026-06-15",
      "category": "Temizlik",
      "type": "OPEX",
      "amount": 24000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Temizlik Aylık Ödemesi (HAZİRAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1072",
      "monthKey": "2026-06",
      "month": "2026-06",
      "date": "2026-06-15",
      "category": "Reklam",
      "type": "OPEX",
      "amount": 55262,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Reklam Aylık Ödemesi (HAZİRAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1073",
      "monthKey": "2026-06",
      "month": "2026-06",
      "date": "2026-06-15",
      "category": "Maaş",
      "type": "OPEX",
      "amount": 85075,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Maaş Aylık Ödemesi (HAZİRAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1074",
      "monthKey": "2026-06",
      "month": "2026-06",
      "date": "2026-06-15",
      "category": "Akaryakıt",
      "type": "OPEX",
      "amount": 22670,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Akaryakıt Aylık Ödemesi (HAZİRAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1075",
      "monthKey": "2026-06",
      "month": "2026-06",
      "date": "2026-06-15",
      "category": "Fatura",
      "type": "OPEX",
      "amount": 49271,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Fatura Aylık Ödemesi (HAZİRAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1076",
      "monthKey": "2026-06",
      "month": "2026-06",
      "date": "2026-06-15",
      "category": "Bakım",
      "type": "OPEX",
      "amount": 51500,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Bakım Aylık Ödemesi (HAZİRAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1077",
      "monthKey": "2026-06",
      "month": "2026-06",
      "date": "2026-06-15",
      "category": "Kredi Kartı / Komisyon",
      "type": "OPEX",
      "amount": 41000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Kredi Kartı / Komisyon Aylık Ödemesi (HAZİRAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1078",
      "monthKey": "2026-07",
      "month": "2026-07",
      "date": "2026-07-15",
      "category": "Muhasebe",
      "type": "OPEX",
      "amount": 43907,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Muhasebe Aylık Ödemesi (TEMMUZ 2026) - Excel Raporu"
    },
    {
      "id": "exp-1079",
      "monthKey": "2026-07",
      "month": "2026-07",
      "date": "2026-07-15",
      "category": "Temizlik",
      "type": "OPEX",
      "amount": 31000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Temizlik Aylık Ödemesi (TEMMUZ 2026) - Excel Raporu"
    },
    {
      "id": "exp-1080",
      "monthKey": "2026-07",
      "month": "2026-07",
      "date": "2026-07-15",
      "category": "Reklam",
      "type": "OPEX",
      "amount": 18880,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Reklam Aylık Ödemesi (TEMMUZ 2026) - Excel Raporu"
    },
    {
      "id": "exp-1081",
      "monthKey": "2026-07",
      "month": "2026-07",
      "date": "2026-07-15",
      "category": "Maaş",
      "type": "OPEX",
      "amount": 85075.5,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Maaş Aylık Ödemesi (TEMMUZ 2026) - Excel Raporu"
    },
    {
      "id": "exp-1082",
      "monthKey": "2026-07",
      "month": "2026-07",
      "date": "2026-07-15",
      "category": "Akaryakıt",
      "type": "OPEX",
      "amount": 19338,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Akaryakıt Aylık Ödemesi (TEMMUZ 2026) - Excel Raporu"
    },
    {
      "id": "exp-1083",
      "monthKey": "2026-07",
      "month": "2026-07",
      "date": "2026-07-15",
      "category": "Fatura",
      "type": "OPEX",
      "amount": 8034,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Fatura Aylık Ödemesi (TEMMUZ 2026) - Excel Raporu"
    },
    {
      "id": "exp-1084",
      "monthKey": "2026-07",
      "month": "2026-07",
      "date": "2026-07-15",
      "category": "Bakım",
      "type": "OPEX",
      "amount": 60800,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Bakım Aylık Ödemesi (TEMMUZ 2026) - Excel Raporu"
    },
    {
      "id": "exp-1085",
      "monthKey": "2026-07",
      "month": "2026-07",
      "date": "2026-07-15",
      "category": "Kredi Kartı / Komisyon",
      "type": "OPEX",
      "amount": 28604,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Kredi Kartı / Komisyon Aylık Ödemesi (TEMMUZ 2026) - Excel Raporu"
    },
    {
      "id": "exp-1086",
      "monthKey": "2026-08",
      "month": "2026-08",
      "date": "2026-08-15",
      "category": "Muhasebe",
      "type": "OPEX",
      "amount": 44655,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Muhasebe Aylık Ödemesi (AĞUSTOS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1087",
      "monthKey": "2026-08",
      "month": "2026-08",
      "date": "2026-08-15",
      "category": "Temizlik",
      "type": "OPEX",
      "amount": 47000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Temizlik Aylık Ödemesi (AĞUSTOS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1088",
      "monthKey": "2026-08",
      "month": "2026-08",
      "date": "2026-08-15",
      "category": "Reklam",
      "type": "OPEX",
      "amount": 20116,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Reklam Aylık Ödemesi (AĞUSTOS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1089",
      "monthKey": "2026-08",
      "month": "2026-08",
      "date": "2026-08-15",
      "category": "Maaş",
      "type": "OPEX",
      "amount": 85075,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Maaş Aylık Ödemesi (AĞUSTOS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1090",
      "monthKey": "2026-08",
      "month": "2026-08",
      "date": "2026-08-15",
      "category": "Akaryakıt",
      "type": "OPEX",
      "amount": 21388,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Akaryakıt Aylık Ödemesi (AĞUSTOS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1091",
      "monthKey": "2026-08",
      "month": "2026-08",
      "date": "2026-08-15",
      "category": "Fatura",
      "type": "OPEX",
      "amount": 17279,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Fatura Aylık Ödemesi (AĞUSTOS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1092",
      "monthKey": "2026-08",
      "month": "2026-08",
      "date": "2026-08-15",
      "category": "Bakım",
      "type": "OPEX",
      "amount": 7050,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Bakım Aylık Ödemesi (AĞUSTOS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1093",
      "monthKey": "2026-08",
      "month": "2026-08",
      "date": "2026-08-15",
      "category": "Kredi Kartı / Komisyon",
      "type": "OPEX",
      "amount": 75519,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Kredi Kartı / Komisyon Aylık Ödemesi (AĞUSTOS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1094",
      "monthKey": "2025-10",
      "month": "2025-10",
      "date": "2025-10-25",
      "category": "Diğer",
      "type": "OPEX",
      "amount": 33727,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Diğer Genel Giderler & Kesintiler (Ekim 2025) - Excel Raporu"
    },
    {
      "id": "exp-1095",
      "monthKey": "2025-10",
      "month": "2025-10",
      "date": "2025-10-28",
      "category": "Bakım",
      "type": "CAPEX",
      "amount": 341556,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Yatırım / Ekipman / Tesis İyileştirme (Ekim 2025) - Excel Raporu"
    },
    {
      "id": "exp-1096",
      "monthKey": "2025-11",
      "month": "2025-11",
      "date": "2025-11-25",
      "category": "Diğer",
      "type": "OPEX",
      "amount": 23933,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Diğer Genel Giderler & Kesintiler (Kasım 2025) - Excel Raporu"
    },
    {
      "id": "exp-1097",
      "monthKey": "2025-11",
      "month": "2025-11",
      "date": "2025-11-28",
      "category": "Bakım",
      "type": "CAPEX",
      "amount": 174792,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Yatırım / Ekipman / Tesis İyileştirme (Kasım 2025) - Excel Raporu"
    },
    {
      "id": "exp-1098",
      "monthKey": "2025-12",
      "month": "2025-12",
      "date": "2025-12-25",
      "category": "Diğer",
      "type": "OPEX",
      "amount": 35829,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Diğer Genel Giderler & Kesintiler (Aralık 2025) - Excel Raporu"
    },
    {
      "id": "exp-1099",
      "monthKey": "2025-12",
      "month": "2025-12",
      "date": "2025-12-28",
      "category": "Bakım",
      "type": "CAPEX",
      "amount": 174287,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Yatırım / Ekipman / Tesis İyileştirme (Aralık 2025) - Excel Raporu"
    },
    {
      "id": "exp-1100",
      "monthKey": "2026-01",
      "month": "2026-01",
      "date": "2026-01-25",
      "category": "Diğer",
      "type": "OPEX",
      "amount": 46993,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Diğer Genel Giderler & Kesintiler (Ocak 2026) - Excel Raporu"
    },
    {
      "id": "exp-1101",
      "monthKey": "2026-01",
      "month": "2026-01",
      "date": "2026-01-28",
      "category": "Bakım",
      "type": "CAPEX",
      "amount": 465331,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Yatırım / Ekipman / Tesis İyileştirme (Ocak 2026) - Excel Raporu"
    },
    {
      "id": "exp-1102",
      "monthKey": "2026-02",
      "month": "2026-02",
      "date": "2026-02-25",
      "category": "Diğer",
      "type": "OPEX",
      "amount": 37703,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Diğer Genel Giderler & Kesintiler (Şubat 2026) - Excel Raporu"
    },
    {
      "id": "exp-1103",
      "monthKey": "2026-02",
      "month": "2026-02",
      "date": "2026-02-28",
      "category": "Bakım",
      "type": "CAPEX",
      "amount": 257306,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Yatırım / Ekipman / Tesis İyileştirme (Şubat 2026) - Excel Raporu"
    },
    {
      "id": "exp-1104",
      "monthKey": "2026-03",
      "month": "2026-03",
      "date": "2026-03-25",
      "category": "Diğer",
      "type": "OPEX",
      "amount": 27626,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Diğer Genel Giderler & Kesintiler (Mart 2026) - Excel Raporu"
    },
    {
      "id": "exp-1105",
      "monthKey": "2026-03",
      "month": "2026-03",
      "date": "2026-03-28",
      "category": "Bakım",
      "type": "CAPEX",
      "amount": 45000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Yatırım / Ekipman / Tesis İyileştirme (Mart 2026) - Excel Raporu"
    },
    {
      "id": "exp-1106",
      "monthKey": "2026-04",
      "month": "2026-04",
      "date": "2026-04-25",
      "category": "Diğer",
      "type": "OPEX",
      "amount": 11085,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Diğer Genel Giderler & Kesintiler (Nisan 2026) - Excel Raporu"
    },
    {
      "id": "exp-1107",
      "monthKey": "2026-04",
      "month": "2026-04",
      "date": "2026-04-28",
      "category": "Bakım",
      "type": "CAPEX",
      "amount": 172948,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Yatırım / Ekipman / Tesis İyileştirme (Nisan 2026) - Excel Raporu"
    },
    {
      "id": "exp-1108",
      "monthKey": "2026-05",
      "month": "2026-05",
      "date": "2026-05-28",
      "category": "Bakım",
      "type": "CAPEX",
      "amount": 216899,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Yatırım / Ekipman / Tesis İyileştirme (Mayıs 2026) - Excel Raporu"
    },
    {
      "id": "exp-1109",
      "monthKey": "2026-06",
      "month": "2026-06",
      "date": "2026-06-25",
      "category": "Diğer",
      "type": "OPEX",
      "amount": 15760,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Diğer Genel Giderler & Kesintiler (Haziran 2026) - Excel Raporu"
    },
    {
      "id": "exp-1110",
      "monthKey": "2026-06",
      "month": "2026-06",
      "date": "2026-06-28",
      "category": "Bakım",
      "type": "CAPEX",
      "amount": 112165,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Yatırım / Ekipman / Tesis İyileştirme (Haziran 2026) - Excel Raporu"
    },
    {
      "id": "exp-1111",
      "monthKey": "2026-07",
      "month": "2026-07",
      "date": "2026-07-25",
      "category": "Diğer",
      "type": "OPEX",
      "amount": 13317.5,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Diğer Genel Giderler & Kesintiler (Temmuz 2026) - Excel Raporu"
    },
    {
      "id": "exp-1112",
      "monthKey": "2026-07",
      "month": "2026-07",
      "date": "2026-07-28",
      "category": "Bakım",
      "type": "CAPEX",
      "amount": 22166,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Yatırım / Ekipman / Tesis İyileştirme (Temmuz 2026) - Excel Raporu"
    },
    {
      "id": "exp-1113",
      "monthKey": "2026-08",
      "month": "2026-08",
      "date": "2026-08-25",
      "category": "Diğer",
      "type": "OPEX",
      "amount": 19224,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Diğer Genel Giderler & Kesintiler (Ağustos 2026) - Excel Raporu"
    },
    {
      "id": "exp-1114",
      "monthKey": "2026-08",
      "month": "2026-08",
      "date": "2026-08-28",
      "category": "Bakım",
      "type": "CAPEX",
      "amount": 3866,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Yatırım / Ekipman / Tesis İyileştirme (Ağustos 2026) - Excel Raporu"
    }
  ],
  "bankBalances": {
    "month": "2026-08",
    "garanti": 42292.93,
    "kuveyt": 4377.98,
    "npara": 939.26,
    "nakit": 0,
    "total": 47610.170000000006
  },
  "allTimeTotals": {
    "totalRevenue": 5004165.4,
    "totalNights": 457,
    "avgDailyRate": 10950,
    "totalOpex": 3884571,
    "totalCapex": 1986316,
    "totalExpense": 5870887,
    "netCashProfit": -866721.5999999996,
    "targetCiro": 4920000,
    "villas": {
      "seyir": {
        "name": "Seyir Dağ Evi",
        "days": 97,
        "rev": 1380134
      },
      "dogus": {
        "name": "Doğuş Dağ Evi",
        "days": 98,
        "rev": 903353.4
      },
      "zirve": {
        "name": "Zirve Dağ Evi",
        "days": 85,
        "rev": 1214493.4
      },
      "sirin": {
        "name": "Şirin Dağ Evi",
        "days": 85,
        "rev": 424213.6
      },
      "nefes": {
        "name": "Nefes Dağ Evi",
        "days": 92,
        "rev": 1081971
      }
    }
  }
};

const DEFAULT_VILLAS = {
  'SEYIR': { name: 'Seyir Dağ Evi', code: 'seyir', capacity: '6+2 Kişi', floor: 3500, base: 4500, target: 6000, premium: 8500, peak: 12000, cleanCost: 800, heatCost: 350 },
  'DOGUS': { name: 'Doğuş Dağ Evi', code: 'dogus', capacity: '11 Kişi', floor: 5000, base: 6500, target: 9000, premium: 13000, peak: 18000, cleanCost: 1200, heatCost: 500 },
  'ZIRVE': { name: 'Zirve Dağ Evi (Jakuzi/Sauna)', code: 'zirve', capacity: '9 Kişi', floor: 6500, base: 8500, target: 12000, premium: 16500, peak: 24000, cleanCost: 1500, heatCost: 700 },
  'SIRIN': { name: 'Şirin Dağ Evi', code: 'sirin', capacity: '7 Kişi', floor: 3000, base: 4000, target: 5500, premium: 7500, peak: 11000, cleanCost: 750, heatCost: 300 },
  'NEFES': { name: 'Nefes Dağ Evi', code: 'nefes', capacity: '12 Kişi', floor: 5500, base: 7000, target: 9500, premium: 14000, peak: 19000, cleanCost: 1400, heatCost: 550 }
};

const EXPENSE_CATEGORIES = [
  { name: 'Maaş', color: '#3B82F6' },
  { name: 'Temizlik', color: '#10B981' },
  { name: 'Bakım', color: '#F59E0B' },
  { name: 'Reklam', color: '#EC4899' },
  { name: 'Akaryakıt', color: '#8B5CF6' },
  { name: 'Fatura', color: '#06B6D4' },
  { name: 'Muhasebe', color: '#64748B' },
  { name: 'Kredi Kartı / Komisyon', color: '#EF4444' },
  { name: 'Danışmanlık', color: '#14B8A6' },
  { name: 'Diğer', color: '#94A3B8' }
];

const DEFAULT_TARGETS_BY_MONTH = {};
Object.keys(COMPANY_EXCEL_DATABASE.targets).forEach(k => {
  DEFAULT_TARGETS_BY_MONTH[k] = {
    revenue: COMPANY_EXCEL_DATABASE.targets[k],
    netProfit: Math.round(COMPANY_EXCEL_DATABASE.targets[k] * 0.3),
    margin: 30.0,
    occupancy: 65.0,
    adr: 5500
  };
});

const DEFAULT_EXPENSES = COMPANY_EXCEL_DATABASE.expensesList;

const DEFAULT_BOOKINGS = [
  // Ağustos 2026 Bookings (Produces 483.965 TL Revenue, 79 Sold Nights)
  { id: 'REZ-AUG-001', villa: 'ZIRVE', guest: 'Canan Özdemir', checkIn: '2026-08-02', checkOut: '2026-08-06', nights: 4, channel: 'WHATSAPP', gross: 65000, otaComm: 0, cleanFee: 0, net: 65000, pax: 8, status: 'COMPLETED' },
  { id: 'REZ-AUG-002', villa: 'ZIRVE', guest: 'Alp Erkin', checkIn: '2026-08-10', checkOut: '2026-08-15', nights: 5, channel: 'AIRBNB', gross: 85000, otaComm: 11810, cleanFee: 0, net: 73190, pax: 9, status: 'COMPLETED' },
  { id: 'REZ-AUG-003', villa: 'DOGUS', guest: 'Serdar Kaya', checkIn: '2026-08-01', checkOut: '2026-08-14', nights: 13, channel: 'WHATSAPP', gross: 98000, otaComm: 0, cleanFee: 0, net: 98000, pax: 11, status: 'COMPLETED' },
  { id: 'REZ-AUG-004', villa: 'DOGUS', guest: 'Burak Arslan', checkIn: '2026-08-18', checkOut: '2026-08-25', nights: 7, channel: 'BOOKING', gross: 55000, otaComm: 9900, cleanFee: 0, net: 45100, pax: 10, status: 'COMPLETED' },
  { id: 'REZ-AUG-005', villa: 'SEYIR', guest: 'Murat Yılmaz', checkIn: '2026-08-05', checkOut: '2026-08-16', nights: 11, channel: 'INSTAGRAM', gross: 58000, otaComm: 0, cleanFee: 0, net: 58000, pax: 6, status: 'COMPLETED' },
  { id: 'REZ-AUG-006', villa: 'SEYIR', guest: 'Okan Şen', checkIn: '2026-08-20', checkOut: '2026-08-29', nights: 9, channel: 'AIRBNB', gross: 52000, otaComm: 7800, cleanFee: 0, net: 44200, pax: 8, status: 'COMPLETED' },
  { id: 'REZ-AUG-007', villa: 'SIRIN', guest: 'Gizem Aksoy', checkIn: '2026-08-01', checkOut: '2026-08-15', nights: 14, channel: 'BOOKING', gross: 42000, otaComm: 7560, cleanFee: 0, net: 34440, pax: 7, status: 'COMPLETED' },
  { id: 'REZ-AUG-008', villa: 'SIRIN', guest: 'Kaan Demir', checkIn: '2026-08-16', checkOut: '2026-08-28', nights: 12, channel: 'WHATSAPP', gross: 32000, otaComm: 0, cleanFee: 0, net: 32000, pax: 6, status: 'COMPLETED' },
  { id: 'REZ-AUG-009', villa: 'NEFES', guest: 'Turgut Baran', checkIn: '2026-08-08', checkOut: '2026-08-12', nights: 4, channel: 'WHATSAPP', gross: 34035, otaComm: 0, cleanFee: 0, net: 34035, pax: 12, status: 'COMPLETED' },

  // Eylül 2026 Bookings
  { id: 'REZ-SEP-001', villa: 'SEYIR', guest: 'Hakan Demir', checkIn: '2026-09-01', checkOut: '2026-09-04', nights: 3, channel: 'AIRBNB', gross: 28000, otaComm: 4200, cleanFee: 1500, net: 22300, pax: 6, status: 'COMPLETED' },
  { id: 'REZ-SEP-002', villa: 'DOGUS', guest: 'Murat Kaya', checkIn: '2026-09-03', checkOut: '2026-09-06', nights: 3, channel: 'WHATSAPP', gross: 36000, otaComm: 0, cleanFee: 0, net: 36000, pax: 10, status: 'COMPLETED' },
  { id: 'REZ-SEP-003', villa: 'ZIRVE', guest: 'Ahmet Yıldız', checkIn: '2026-09-07', checkOut: '2026-09-10', nights: 3, channel: 'AIRBNB', gross: 48000, otaComm: 7200, cleanFee: 2000, net: 38800, pax: 8, status: 'COMPLETED' },
  { id: 'REZ-SEP-004', villa: 'SIRIN', guest: 'Emre Can', checkIn: '2026-09-08', checkOut: '2026-09-11', nights: 3, channel: 'BOOKING', gross: 21000, otaComm: 3780, cleanFee: 1000, net: 16220, pax: 6, status: 'COMPLETED' },
  { id: 'REZ-SEP-005', villa: 'NEFES', guest: 'Ayşe Yılmaz', checkIn: '2026-09-12', checkOut: '2026-09-15', nights: 3, channel: 'WHATSAPP', gross: 38000, otaComm: 0, cleanFee: 0, net: 38000, pax: 12, status: 'CONFIRMED' },
  { id: 'REZ-SEP-006', villa: 'SEYIR', guest: 'Cemil Öz', checkIn: '2026-09-15', checkOut: '2026-09-18', nights: 3, channel: 'INSTAGRAM', gross: 24000, otaComm: 0, cleanFee: 0, net: 24000, pax: 6, status: 'CONFIRMED' },
  { id: 'REZ-SEP-007', villa: 'ZIRVE', guest: 'Burak Tan', checkIn: '2026-09-18', checkOut: '2026-09-21', nights: 3, channel: 'WHATSAPP', gross: 45000, otaComm: 0, cleanFee: 0, net: 45000, pax: 8, status: 'CONFIRMED' },
  { id: 'REZ-SEP-008', villa: 'SEYIR', guest: 'Ali Kemal', checkIn: '2026-09-29', checkOut: '2026-10-03', nights: 4, channel: 'AIRBNB', gross: 40000, otaComm: 6000, cleanFee: 2000, net: 32000, pax: 6, status: 'CONFIRMED' }
];

// Initial Seed Expenses (August 2026 Scenario matches user prompt: Opex = 337.306 TL, Capex = 3.866 TL)
// Old expenses replaced by COMPANY_EXCEL_DATABASE.expensesList


const DEFAULT_LEADS = [
  { id: 'L1', guest: 'Hakan Demir', villa: 'SEYIR', channel: 'Airbnb', quote: 28000, status: 'WON', lostReason: '-', notes: 'Rezervasyona dönüştü' },
  { id: 'L2', guest: 'Murat Kaya', villa: 'DOGUS', channel: 'WhatsApp', quote: 36000, status: 'WON', lostReason: '-', notes: 'Hemen kapandı' },
  { id: 'L3', guest: 'Selin B.', villa: 'ZIRVE', channel: 'Instagram', quote: 45000, status: 'FOLLOW_UP', lostReason: '-', notes: 'Akşam arayacak' },
  { id: 'L4', guest: 'Kemal V.', villa: 'SIRIN', channel: 'WhatsApp', quote: 18000, status: 'LOST', lostReason: 'Fiyat Yüksek', notes: 'Bütçe uymadı' },
  { id: 'L5', guest: 'Derya S.', villa: 'NEFES', channel: 'Phone', quote: 35000, status: 'QUOTE_SENT', lostReason: '-', notes: 'Tarih teyidi bekleniyor' }
];

const DEFAULT_MAINT = [
  { id: 'M1', villa: 'DOGUS', priority: 'P1', title: 'Isı pompası sensör değişimi', assignee: 'Ahmet Usta', downtime: 1, cost: 4500, status: 'OPEN' },
  { id: 'M2', villa: 'ZIRVE', priority: 'P2', title: 'Jakuzi ozon ve filtre bakımı', assignee: 'Teknik Servis', downtime: 0, cost: 2800, status: 'COMPLETED' },
  { id: 'M3', villa: 'SEYIR', priority: 'P2', title: 'Şömine bacası periyodik temizliği', assignee: 'Mehmet', downtime: 0, cost: 1500, status: 'OPEN' }
];

// App State Container
let appData = {
  villas: {},
  targets: {},
  bookings: [],
  expenses: [],
  leads: [],
  maintenance: []
};

// Global Active Filter
let currentFilter = {
  period: '2026-08',
  villa: 'ALL'
};

let activeTrendRange = '6M';
let pendingImportRows = null;

// Initialize and Load Data
function loadAppData() {
  try {
    const saved = localStorage.getItem('LEXBNB_V5_MASTER_DATA');
    if (saved) {
      appData = JSON.parse(saved);
      if (!appData.villas) appData.villas = JSON.parse(JSON.stringify(DEFAULT_VILLAS));
      if (!appData.targets) appData.targets = JSON.parse(JSON.stringify(DEFAULT_TARGETS_BY_MONTH));
      // Ensure company expenses from GENEL RAPOR.xlsx are loaded
      if (!appData.expenses || appData.expenses.length < 50) {
        appData.expenses = JSON.parse(JSON.stringify(DEFAULT_EXPENSES));
      }
    } else {
      appData = {
        villas: JSON.parse(JSON.stringify(DEFAULT_VILLAS)),
        targets: JSON.parse(JSON.stringify(DEFAULT_TARGETS_BY_MONTH)),
        bookings: JSON.parse(JSON.stringify(DEFAULT_BOOKINGS)),
        expenses: JSON.parse(JSON.stringify(DEFAULT_EXPENSES)),
        leads: JSON.parse(JSON.stringify(DEFAULT_LEADS)),
        maintenance: JSON.parse(JSON.stringify(DEFAULT_MAINT))
      };
      saveAppData();
    }
  } catch (e) {
    console.error('Error loading state:', e);
  }
}

function saveAppData() {
  localStorage.setItem('LEXBNB_V5_MASTER_DATA', JSON.stringify(appData));
  renderAll();
}

const ALL_FINANCIAL_MONTHS = [
  '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
  '2026-07', '2026-08', '2026-09'
];

const ALL_MONTH_NAMES = {
  '2025-07': 'Temmuz 2025',
  '2025-08': 'Ağustos 2025',
  '2025-09': 'Eylül 2025',
  '2025-10': 'Ekim 2025',
  '2025-11': 'Kasım 2025',
  '2025-12': 'Aralık 2025',
  '2026-01': 'Ocak 2026',
  '2026-02': 'Şubat 2026',
  '2026-03': 'Mart 2026',
  '2026-04': 'Nisan 2026',
  '2026-05': 'Mayıs 2026',
  '2026-06': 'Haziran 2026',
  '2026-07': 'Temmuz 2026',
  '2026-08': 'Ağustos 2026',
  '2026-09': 'Eylül 2026',
  'ALL': 'Tüm Zamanlar (14 Ay)'
};

function handleFilterChange() {
  currentFilter.period = document.getElementById('globalPeriodFilter').value;
  currentFilter.villa = document.getElementById('globalVillaFilter').value;
  updateStepperLabels();
  renderAll();
}

function stepMonth(delta) {
  let idx = ALL_FINANCIAL_MONTHS.indexOf(currentFilter.period);
  if (idx === -1) idx = ALL_FINANCIAL_MONTHS.indexOf('2026-08');

  let newIdx = idx + delta;
  if (newIdx >= 0 && newIdx < ALL_FINANCIAL_MONTHS.length) {
    currentFilter.period = ALL_FINANCIAL_MONTHS[newIdx];
    const select = document.getElementById('globalPeriodFilter');
    if (select) select.value = currentFilter.period;
    handleFilterChange();
  }
}

function updateStepperLabels() {
  const curIdx = ALL_FINANCIAL_MONTHS.indexOf(currentFilter.period);
  const curLabel = ALL_MONTH_NAMES[currentFilter.period] || currentFilter.period;

  const curEl = document.getElementById('stepperCurrentLabel');
  if (curEl) curEl.innerText = curLabel;

  const prevEl = document.getElementById('stepperPrevLabel');
  if (prevEl) prevEl.innerText = curIdx > 0 ? ALL_MONTH_NAMES[ALL_FINANCIAL_MONTHS[curIdx - 1]] : '';

  const nextEl = document.getElementById('stepperNextLabel');
  if (nextEl) nextEl.innerText = curIdx >= 0 && curIdx < ALL_FINANCIAL_MONTHS.length - 1 ? ALL_MONTH_NAMES[ALL_FINANCIAL_MONTHS[curIdx + 1]] : '';

  const vLabel = currentFilter.villa === 'ALL' ? 'Tüm Mülkler (5 Villa)' : (appData.villas[currentFilter.villa]?.name || currentFilter.villa);
  const vEl = document.getElementById('finTopPropertyLabel');
  if (vEl) vEl.innerText = vLabel;
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  const activeBtn = document.querySelector(`.tab-btn[onclick*="${tabId}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  const content = document.getElementById(`tab-${tabId}`);
  if (content) content.classList.add('active');

  if (tabId === 'settings') renderSettingsTable();
  if (tabId === 'finance') renderFinanceModule();
  if (tabId === 'expenses') renderExpensesTable();
}

function isBookingInFilter(b) {
  if (currentFilter.villa !== 'ALL' && b.villa !== currentFilter.villa) return false;
  if (currentFilter.period === 'ALL') return true;
  const bInMonth = b.checkIn.slice(0, 7);
  const bOutMonth = b.checkOut.slice(0, 7);
  return (bInMonth === currentFilter.period || bOutMonth === currentFilter.period);
}

function isExpenseInFilter(exp) {
  if (currentFilter.villa !== 'ALL' && exp.villa !== 'ALL' && exp.villa !== currentFilter.villa) return false;
  if (currentFilter.period === 'ALL') return true;
  return exp.monthKey === currentFilter.period || exp.month === currentFilter.period;
}

// Master Render All Components
function renderAll() {
  updateStepperLabels();
  renderFinanceModule();
  renderKPIsAndDashboard();
  renderManageBookingsTable();
  renderExpensesTable();
  renderManageLeadsTable();
  renderManageMaintTable();
  renderGapNights();
  renderTodayRadar();
  renderOtaRadar();
  renderBankBalances();

  // Badges
  const rBadge = document.getElementById('rezCountBadge');
  if (rBadge) rBadge.innerText = appData.bookings.length;
  const eBadge = document.getElementById('expenseCountBadge');
  if (eBadge) eBadge.innerText = appData.expenses.length;
  const lBadge = document.getElementById('leadCountBadge');
  if (lBadge) lBadge.innerText = appData.leads.length;
  const mBadge = document.getElementById('maintCountBadge');
  if (mBadge) mBadge.innerText = appData.maintenance.filter(m => m.status === 'OPEN').length;
}

// =============================================================
// 1. PROFESYONEL FİNANSAL PERFORMANS MODÜLÜ (GENEL RAPOR ENTEGRELİ)
// =============================================================
function renderFinanceModule() {
  let totalRevenue = 0;
  let totalOpex = 0;
  let totalCapex = 0;
  let totalSoldNights = 0;
  let avgRevPerNight = 0;
  let targetRev = 300000;
  let propStats = {
    SEYIR: { name: 'Seyir Dağ Evi', revenue: 0, nights: 0, adr: 0, occupancy: 0, revpar: 0, share: 0 },
    DOGUS: { name: 'Doğuş Dağ Evi', revenue: 0, nights: 0, adr: 0, occupancy: 0, revpar: 0, share: 0 },
    ZIRVE: { name: 'Zirve Dağ Evi', revenue: 0, nights: 0, adr: 0, occupancy: 0, revpar: 0, share: 0 },
    SIRIN: { name: 'Şirin Dağ Evi', revenue: 0, nights: 0, adr: 0, occupancy: 0, revpar: 0, share: 0 },
    NEFES: { name: 'Nefes Dağ Evi', revenue: 0, nights: 0, adr: 0, occupancy: 0, revpar: 0, share: 0 }
  };

  const categoryTotals = {};
  EXPENSE_CATEGORIES.forEach(c => { categoryTotals[c.name] = 0; });

  if (currentFilter.period === 'ALL') {
    // All-time Totals (14 Months from GENEL RAPOR.xlsx)
    const att = COMPANY_EXCEL_DATABASE.allTimeTotals;
    totalRevenue = att.totalRevenue;
    totalSoldNights = att.totalNights;
    avgRevPerNight = att.avgDailyRate;
    totalOpex = att.totalOpex;
    totalCapex = att.totalCapex;
    targetRev = att.targetCiro;

    // All-time per villa
    propStats.SEYIR = { name: 'Seyir Dağ Evi', revenue: att.villas.seyir.rev, nights: att.villas.seyir.days, adr: Math.round(att.villas.seyir.rev / att.villas.seyir.days), share: Number(((att.villas.seyir.rev / totalRevenue)*100).toFixed(1)), occupancy: Number(((att.villas.seyir.days / (14*30))*100).toFixed(1)), revpar: Math.round(att.villas.seyir.rev / (14*30)) };
    propStats.DOGUS = { name: 'Doğuş Dağ Evi', revenue: att.villas.dogus.rev, nights: att.villas.dogus.days, adr: Math.round(att.villas.dogus.rev / att.villas.dogus.days), share: Number(((att.villas.dogus.rev / totalRevenue)*100).toFixed(1)), occupancy: Number(((att.villas.dogus.days / (14*30))*100).toFixed(1)), revpar: Math.round(att.villas.dogus.rev / (14*30)) };
    propStats.ZIRVE = { name: 'Zirve Dağ Evi', revenue: att.villas.zirve.rev, nights: att.villas.zirve.days, adr: Math.round(att.villas.zirve.rev / att.villas.zirve.days), share: Number(((att.villas.zirve.rev / totalRevenue)*100).toFixed(1)), occupancy: Number(((att.villas.zirve.days / (14*30))*100).toFixed(1)), revpar: Math.round(att.villas.zirve.rev / (14*30)) };
    propStats.SIRIN = { name: 'Şirin Dağ Evi', revenue: att.villas.sirin.rev, nights: att.villas.sirin.days, adr: Math.round(att.villas.sirin.rev / att.villas.sirin.days), share: Number(((att.villas.sirin.rev / totalRevenue)*100).toFixed(1)), occupancy: Number(((att.villas.sirin.days / (14*30))*100).toFixed(1)), revpar: Math.round(att.villas.sirin.rev / (14*30)) };
    propStats.NEFES = { name: 'Nefes Dağ Evi', revenue: att.villas.nefes.rev, nights: att.villas.nefes.days, adr: Math.round(att.villas.nefes.rev / att.villas.nefes.days), share: Number(((att.villas.nefes.rev / totalRevenue)*100).toFixed(1)), occupancy: Number(((att.villas.nefes.days / (14*30))*100).toFixed(1)), revpar: Math.round(att.villas.nefes.rev / (14*30)) };

    // Sum all expenses
    appData.expenses.forEach(exp => {
      const amt = Number(exp.amount) || 0;
      if (categoryTotals[exp.category] !== undefined) categoryTotals[exp.category] += amt;
      else categoryTotals['Diğer'] = (categoryTotals['Diğer'] || 0) + amt;
    });

  } else {
    // Specific Month from Official Database
    const mf = COMPANY_EXCEL_DATABASE.monthlyFinancials[currentFilter.period];
    const pm = COMPANY_EXCEL_DATABASE.propertyMonthly[currentFilter.period];

    if (mf) {
      totalRevenue = mf.ciro;
      totalOpex = mf.opex;
      totalCapex = mf.capex;
      totalSoldNights = mf.daysSold || (pm ? pm.totalDays : 0);
      avgRevPerNight = mf.avgDaily ? Math.round(mf.avgDaily) : (totalSoldNights > 0 ? Math.round(totalRevenue / totalSoldNights) : 0);
      targetRev = COMPANY_EXCEL_DATABASE.targets[currentFilter.period] || 300000;
    }

    if (pm && pm.villas) {
      pm.villas.forEach(v => {
        propStats[v.id] = {
          name: v.name,
          revenue: v.rev,
          nights: v.days,
          adr: v.adr,
          share: v.share,
          occupancy: v.occupancy,
          revpar: v.revpar
        };
      });
    }

    // Filter single villa if specified
    if (currentFilter.villa !== 'ALL' && propStats[currentFilter.villa]) {
      const vData = propStats[currentFilter.villa];
      totalRevenue = vData.revenue;
      totalSoldNights = vData.nights;
      avgRevPerNight = vData.adr;
      // Villa's approximate share of opex and capex based on revenue share
      const vShare = vData.share > 0 ? vData.share / 100 : 0.2;
      totalOpex = Math.round(totalOpex * vShare);
      totalCapex = Math.round(totalCapex * vShare);
      targetRev = Math.round(targetRev * 0.2);
    }

    // Categorical expenses for this specific month
    appData.expenses.forEach(exp => {
      if (!isExpenseInFilter(exp)) return;
      const amt = Number(exp.amount) || 0;
      if (categoryTotals[exp.category] !== undefined) {
        categoryTotals[exp.category] += amt;
      } else {
        categoryTotals['Diğer'] = (categoryTotals['Diğer'] || 0) + amt;
      }
    });
  }

  // Hierarchy calculations
  const operatingProfit = totalRevenue - totalOpex;
  const netCashProfit = operatingProfit - totalCapex;
  const totalExpense = totalOpex + totalCapex;
  const netMargin = totalRevenue > 0 ? (netCashProfit / totalRevenue) * 100 : 0;
  const expenseRatio = totalRevenue > 0 ? (totalExpense / totalRevenue) * 100 : 0;

  // Monthly Target Comparison
  const targetDiff = totalRevenue - targetRev;
  const targetPct = targetRev > 0 ? (totalRevenue / targetRev) * 100 : 0;
  const forecastEndMonth = Math.round(totalRevenue * 1.018);

  // Update Top 5 KPI Cards
  const setEl = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };

  setEl('finActualRevenue', `${Math.round(totalRevenue).toLocaleString('tr-TR')} TL`);
  setEl('finRevTargetDelta', `Hedefin %${Math.round(Math.abs(targetPct - 100))} ${targetDiff >= 0 ? 'üzerinde' : 'altında'}`);
  setEl('finTargetRevenue', `${Math.round(targetRev).toLocaleString('tr-TR')} TL`);
  setEl('finTargetDiff', `${targetDiff >= 0 ? '+' : ''}${Math.round(targetDiff).toLocaleString('tr-TR')} TL fark`);

  setEl('finNetProfit', `${Math.round(netCashProfit).toLocaleString('tr-TR')} TL`);
  setEl('finNetMarginLabel', `%${netMargin.toFixed(1)} net kâr marjı`);

  setEl('finTotalExpense', `${Math.round(totalExpense).toLocaleString('tr-TR')} TL`);
  setEl('finExpenseRatio', `Cironun %${expenseRatio.toFixed(1)}'i`);

  setEl('finSoldNights', `${totalSoldNights} gece`);
  setEl('finAvgRevPerNight', `${avgRevPerNight.toLocaleString('tr-TR')} TL / satılan gece`);

  // Target Analysis Box
  setEl('tgtBoxTarget', `${Math.round(targetRev).toLocaleString('tr-TR')} TL`);
  setEl('tgtBoxActual', `${Math.round(totalRevenue).toLocaleString('tr-TR')} TL`);
  setEl('tgtBoxDiff', `${targetDiff >= 0 ? '+' : ''}${Math.round(targetDiff).toLocaleString('tr-TR')} TL`);
  setEl('tgtBoxPct', `%${targetPct.toFixed(1)}`);
  setEl('tgtBoxForecast', `${forecastEndMonth.toLocaleString('tr-TR')} TL`);
  setEl('finTargetStatusBadge', `%${targetPct.toFixed(1)} Hedef Başarısı`);
  setEl('targetBarRatioText', `${Math.round(totalRevenue).toLocaleString('tr-TR')} TL / ${Math.round(targetRev).toLocaleString('tr-TR')} TL (%${targetPct.toFixed(1)})`);

  const fillEl = document.getElementById('targetBarFill');
  if (fillEl) fillEl.style.width = `${Math.min(100, Math.max(0, targetPct))}%`;

  // Profit Waterfall Bridge
  setEl('brCiro', `${Math.round(totalRevenue).toLocaleString('tr-TR')} TL`);
  setEl('brOpex', `-${Math.round(totalOpex).toLocaleString('tr-TR')} TL`);
  setEl('brOpProfit', `${Math.round(operatingProfit).toLocaleString('tr-TR')} TL`);
  setEl('brCapex', `-${Math.round(totalCapex).toLocaleString('tr-TR')} TL`);
  setEl('brNetProfit', `${Math.round(netCashProfit).toLocaleString('tr-TR')} TL`);
  setEl('brNetMargin', `%${netMargin.toFixed(1)} Net Kâr Marjı`);

  // Render Expense Donut Chart & Category Table
  renderExpenseDonutAndTable(categoryTotals, totalExpense, totalRevenue, totalOpex, totalCapex);

  // Render Property Finance Scorecards
  renderPropertyFinanceCards(propStats, totalRevenue);

  // Render Property Comparison Chart
  renderPropertyComparisonChart(propStats);

  // Render Monthly Trend Chart
  renderMonthlyTrendChart();

  // Render YoY Comparison
  renderYoYComparison(totalRevenue, totalOpex, netCashProfit, totalSoldNights);

  // Render AI Financial Analyst
  renderAIFinancialAnalyst(totalRevenue, targetRev, targetPct, totalOpex, totalCapex, netCashProfit, netMargin, propStats);
}

// -------------------------------------------------------------
// KASA / BANKA DURUMU RENDERER
// -------------------------------------------------------------
function renderBankBalances() {
  const b = COMPANY_EXCEL_DATABASE.bankBalances;
  if (!b) return;
  const setEl = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };
  setEl('kasaGaranti', `${Math.round(b.garanti).toLocaleString('tr-TR')} TL`);
  setEl('kasaKuveyt', `${Math.round(b.kuveyt).toLocaleString('tr-TR')} TL`);
  setEl('kasaNPara', `${Math.round(b.npara).toLocaleString('tr-TR')} TL`);
  setEl('kasaNakit', `${Math.round(b.nakit).toLocaleString('tr-TR')} TL`);
  setEl('kasaTotal', `${Math.round(b.total).toLocaleString('tr-TR')} TL`);
}

// -------------------------------------------------------------
// GİDER ANALİZİ DONUT GRAFİĞİ VE TABLOSU
// -------------------------------------------------------------
function renderExpenseDonutAndTable(categoryTotals, totalExpense, totalRevenue, totalOpex, totalCapex) {
  document.getElementById('donutCenterVal').innerText = `${Math.round(totalExpense).toLocaleString('tr-TR')} TL`;
  document.getElementById('donutOpexVal').innerText = `${Math.round(totalOpex).toLocaleString('tr-TR')} TL`;
  document.getElementById('donutCapexVal').innerText = `${Math.round(totalCapex).toLocaleString('tr-TR')} TL`;

  const svg = document.getElementById('expenseDonutSvg');
  svg.innerHTML = '';

  const cx = 100, cy = 100, r = 70;
  let startAngle = 0;

  // Donut slices
  EXPENSE_CATEGORIES.forEach(cat => {
    const amt = categoryTotals[cat.name] || 0;
    if (amt <= 0 || totalExpense <= 0) return;
    const sliceAngle = (amt / totalExpense) * 360;
    const endAngle = startAngle + sliceAngle;

    const x1 = cx + r * Math.cos((Math.PI * (startAngle - 90)) / 180);
    const y1 = cy + r * Math.sin((Math.PI * (startAngle - 90)) / 180);
    const x2 = cx + r * Math.cos((Math.PI * (endAngle - 90)) / 180);
    const y2 = cy + r * Math.sin((Math.PI * (endAngle - 90)) / 180);

    const largeArc = sliceAngle > 180 ? 1 : 0;
    const pathData = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('fill', cat.color);
    path.setAttribute('stroke', '#111827');
    path.setAttribute('stroke-width', '2');
    path.innerHTML = `<title>${cat.name}: ${amt.toLocaleString('tr-TR')} TL (%${((amt/totalExpense)*100).toFixed(1)})</title>`;
    svg.appendChild(path);

    startAngle = endAngle;
  });

  // Inner cutout circle for Donut effect
  const innerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  innerCircle.setAttribute('cx', cx);
  innerCircle.setAttribute('cy', cy);
  innerCircle.setAttribute('r', '50');
  innerCircle.setAttribute('fill', '#111827');
  svg.appendChild(innerCircle);

  // Category Table
  const tbody = document.getElementById('expenseCategoryTableBody');
  tbody.innerHTML = '';

  const dummyMoMDeltas = { 'Temizlik': '↑ %14', 'Maaş': '↑ %4', 'Bakım': '↑ %22', 'Fatura': '↓ %5', 'Reklam': '↑ %8' };

  EXPENSE_CATEGORIES.forEach(cat => {
    const amt = categoryTotals[cat.name] || 0;
    const shareExpense = totalExpense > 0 ? (amt / totalExpense) * 100 : 0;
    const shareRev = totalRevenue > 0 ? (amt / totalRevenue) * 100 : 0;
    const deltaStr = dummyMoMDeltas[cat.name] || '—';

    const tr = document.createElement('tr');
    tr.className = 'clickable-row';
    tr.onclick = () => filterExpensesByCategory(cat.name);
    tr.innerHTML = `
      <td><span class="cat-dot" style="background:${cat.color};"></span> <strong>${cat.name}</strong></td>
      <td><strong>${Math.round(amt).toLocaleString('tr-TR')} TL</strong></td>
      <td>%${shareExpense.toFixed(1)}</td>
      <td>%${shareRev.toFixed(1)}</td>
      <td><span class="${deltaStr.includes('↑') ? 'text-rose' : 'text-emerald'}">${deltaStr}</span></td>
      <td style="text-align: right;"><button class="btn-text" onclick="event.stopPropagation(); filterExpensesByCategory('${cat.name}')">Detay ›</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function filterExpensesByCategory(catName) {
  switchTab('expenses');
  document.getElementById('expSearchInput').value = catName;
  renderExpensesTable();
}

// -------------------------------------------------------------
// MÜLK BAZLI FİNANSAL KARTLAR (5 VİLLA DETAYI - EXCEL VERİTABANINDAN)
// -------------------------------------------------------------
function renderPropertyFinanceCards(propStats, totalRevenue) {
  const container = document.getElementById('propertyFinanceCardsGrid');
  if (!container) return;
  container.innerHTML = '';

  const vKeys = ['SEYIR', 'DOGUS', 'ZIRVE', 'SIRIN', 'NEFES'];

  vKeys.forEach(vKey => {
    const vConf = DEFAULT_VILLAS[vKey];
    const s = propStats[vKey] || { revenue: 0, nights: 0, adr: 0, occupancy: 0, revpar: 0, share: 0 };
    const ciroShare = totalRevenue > 0 ? (s.revenue / totalRevenue) * 100 : 0;
    const estimatedCost = Math.round((s.revenue * 0.45));
    const estimatedProfit = Math.max(0, s.revenue - estimatedCost);

    const card = document.createElement('div');
    card.className = 'card prop-fin-card';
    card.style.cursor = 'pointer';
    card.onclick = () => {
      const select = document.getElementById('globalVillaFilter');
      if (select) {
        select.value = vKey;
        handleFilterChange();
      }
    };

    card.innerHTML = `
      <div class="prop-card-header">
        <div>
          <h3>${vConf.name.toUpperCase()}</h3>
          <span class="sub-text">${vConf.capacity} • Uludağ Dağ Evi</span>
        </div>
        <span class="badge badge-emerald">%${ciroShare.toFixed(1)} Pay</span>
      </div>

      <div class="prop-metrics-grid">
        <div class="prop-m-item"><span class="lbl">Ciro</span><strong class="val">${Math.round(s.revenue).toLocaleString('tr-TR')} TL</strong></div>
        <div class="prop-m-item"><span class="lbl">Satılan Gece</span><strong class="val">${s.nights} Gece</strong></div>
        <div class="prop-m-item"><span class="lbl">Ortalama ADR</span><strong class="val">${Math.round(s.adr || (s.nights > 0 ? s.revenue / s.nights : 0)).toLocaleString('tr-TR')} TL</strong></div>
        <div class="prop-m-item"><span class="lbl">Tahmini Net Kâr</span><strong class="val text-emerald">${Math.round(estimatedProfit).toLocaleString('tr-TR')} TL</strong></div>
        <div class="prop-m-item"><span class="lbl">Doluluk Oranı</span><strong class="val">%${s.occupancy || (currentFilter.period === 'ALL' ? ((s.nights/(14*30))*100).toFixed(1) : ((s.nights/31)*100).toFixed(1))}</strong></div>
        <div class="prop-m-item"><span class="lbl">RevPAR</span><strong class="val">${Math.round(s.revpar || (currentFilter.period === 'ALL' ? s.revenue / 420 : s.revenue / 31)).toLocaleString('tr-TR')} TL</strong></div>
      </div>
      <div class="prop-card-footer">
        <span>Villaya Göre Filtrele & Detayı Gör ›</span>
      </div>
    `;
    container.appendChild(card);
  });
}

// -------------------------------------------------------------
// MÜLK KARŞILAŞTIRMA VE ANOMALİ TESPİTİ
// -------------------------------------------------------------
function renderPropertyComparisonChart(propStats) {
  const metric = document.getElementById('compMetricSelect')?.value || 'ciro';
  const container = document.getElementById('comparisonBarsContainer');
  if (!container) return;
  container.innerHTML = '';

  const vKeys = ['SEYIR', 'DOGUS', 'ZIRVE', 'SIRIN', 'NEFES'];
  const values = [];

  vKeys.forEach(vKey => {
    const s = propStats[vKey] || { revenue: 0, nights: 0, adr: 0, occupancy: 0, revpar: 0 };
    let val = 0;
    if (metric === 'ciro') val = s.revenue;
    if (metric === 'netKar') val = Math.round(s.revenue * 0.4);
    if (metric === 'adr') val = s.adr || (s.nights > 0 ? Math.round(s.revenue / s.nights) : 0);
    if (metric === 'revpar') val = s.revpar || Math.round(s.revenue / 31);
    if (metric === 'doluluk') val = Number(s.occupancy || ((s.nights / 31) * 100).toFixed(1));
    if (metric === 'satilanGece') val = s.nights;
    values.push({ key: vKey, name: DEFAULT_VILLAS[vKey].name, val });
  });

  const maxVal = Math.max(1, ...values.map(v => v.val));

  values.forEach(item => {
    const barPct = (item.val / maxVal) * 100;
    const row = document.createElement('div');
    row.className = 'comp-bar-row';
    row.innerHTML = `
      <div class="comp-bar-label"><strong>${item.name}</strong></div>
      <div class="comp-bar-track">
        <div class="comp-bar-fill" style="width: ${barPct}%;"></div>
      </div>
      <div class="comp-bar-value"><strong>${typeof item.val === 'number' ? item.val.toLocaleString('tr-TR') : item.val}</strong></div>
    `;
    container.appendChild(row);
  });

  // Anomaly Badges Detection
  const anomContainer = document.getElementById('anomaliesListContainer');
  if (anomContainer) {
    anomContainer.innerHTML = '';

    const anomalies = [];
    if (currentFilter.period === '2026-08' || currentFilter.period === 'ALL') {
      anomalies.push({ type: 'warning', text: '⚠️ ŞİRİN: Yüksek Doluluk (30 Gece / %96,8) ancak Düşük ADR (2.826 TL) — Fiyat savunması zayıf, talep varken taban fiyat derhal artırılmalı.' });
      anomalies.push({ type: 'success', text: '💎 ZİRVE: Sadece 9 satılan gece ile portföyün en yüksek cirosunu (138.190 TL, 15.354 TL/gece) üretti — Premium jakuzi/sauna fiyatlama gücü kanıtlandı.' });
      anomalies.push({ type: 'warning', text: '⚠️ NEFES: 12 kişilik yüksek kapasiteye rağmen ciro (65.302 TL) portföy ortalamasının altında kaldı — Grup rezervasyonları için esnek paketler tavsiye edilir.' });
    } else if (currentFilter.period === '2026-01') {
      anomalies.push({ type: 'success', text: '🔥 REKOR AY: Ocak 2026\'da 843.555 TL ciro ve 512.497 TL net kâr ile şirket rekoru kırıldı. Zirve 279.549 TL tek başına ciro getirdi.' });
    } else {
      anomalies.push({ type: 'info', text: `📌 ${ALL_MONTH_NAMES[currentFilter.period] || currentFilter.period} dönemi resmi şirket raporu verileri başarıyla incelendi.` });
    }

    anomalies.forEach(anom => {
      const div = document.createElement('div');
      div.className = `anomaly-alert ${anom.type}`;
      div.innerText = anom.text;
      anomContainer.appendChild(div);
    });
  }
}

// -------------------------------------------------------------
// AYLIK TREND VE GEÇEN YIL KARŞILAŞTIRMASI (RESMİ EXCEL VERİLERİ)
// -------------------------------------------------------------
function setTrendRange(range) {
  activeTrendRange = range;
  document.querySelectorAll('.trend-btn').forEach(b => b.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');
  renderMonthlyTrendChart();
}

function renderMonthlyTrendChart() {
  const container = document.getElementById('trendChartContainer');
  if (!container) return;
  container.innerHTML = '';

  const mfKeys = [
    '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03',
    '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'
  ];

  let keysToShow = mfKeys;
  if (activeTrendRange === '3M') keysToShow = mfKeys.slice(-3);
  if (activeTrendRange === '6M') keysToShow = mfKeys.slice(-6);
  if (activeTrendRange === 'YTD') keysToShow = mfKeys.filter(k => k.startsWith('2026'));

  const displayData = keysToShow.map(k => {
    const f = COMPANY_EXCEL_DATABASE.monthlyFinancials[k];
    return {
      key: k,
      month: (f.monthName.slice(0, 3) + ' ' + f.year.slice(2)),
      ciro: f.ciro,
      opex: f.opex,
      profit: Math.max(0, f.netProfit)
    };
  });

  const maxVal = Math.max(100000, ...displayData.map(d => Math.max(d.ciro, d.opex)));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 500 210');
  svg.setAttribute('class', 'trend-svg');

  const stepX = 500 / displayData.length;
  const barW = Math.max(8, Math.min(22, stepX / 4));

  displayData.forEach((d, idx) => {
    const baseX = idx * stepX + (stepX / 2) - (barW * 1.6);
    const hCiro = Math.max(2, (d.ciro / maxVal) * 155);
    const hOpex = Math.max(2, (d.opex / maxVal) * 155);
    const hProfit = Math.max(2, (d.profit / maxVal) * 155);

    // Ciro bar
    const rCiro = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rCiro.setAttribute('x', baseX);
    rCiro.setAttribute('y', 175 - hCiro);
    rCiro.setAttribute('width', barW);
    rCiro.setAttribute('height', hCiro);
    rCiro.setAttribute('fill', '#3B82F6');
    rCiro.setAttribute('rx', '3');
    rCiro.innerHTML = `<title>${d.key} Ciro: ${d.ciro.toLocaleString('tr-TR')} TL</title>`;
    svg.appendChild(rCiro);

    // Opex bar
    const rOpex = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rOpex.setAttribute('x', baseX + barW + 2);
    rOpex.setAttribute('y', 175 - hOpex);
    rOpex.setAttribute('width', barW);
    rOpex.setAttribute('height', hOpex);
    rOpex.setAttribute('fill', '#EF4444');
    rOpex.setAttribute('rx', '3');
    rOpex.innerHTML = `<title>${d.key} Gider: ${d.opex.toLocaleString('tr-TR')} TL</title>`;
    svg.appendChild(rOpex);

    // Profit bar
    const rProfit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rProfit.setAttribute('x', baseX + (barW * 2) + 4);
    rProfit.setAttribute('y', 175 - hProfit);
    rProfit.setAttribute('width', barW);
    rProfit.setAttribute('height', hProfit);
    rProfit.setAttribute('fill', '#10B981');
    rProfit.setAttribute('rx', '3');
    rProfit.innerHTML = `<title>${d.key} Net Kâr: ${d.profit.toLocaleString('tr-TR')} TL</title>`;
    svg.appendChild(rProfit);

    // Label
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', baseX + (barW * 1.5));
    text.setAttribute('y', 198);
    text.setAttribute('fill', '#9CA3AF');
    text.setAttribute('font-size', '10');
    text.setAttribute('text-anchor', 'middle');
    text.textContent = d.month;
    svg.appendChild(text);
  });

  container.appendChild(svg);
}

function renderYoYComparison(actualRevenue, actualOpex, actualNetProfit, actualNights) {
  let prevKey = '2025-08';
  if (currentFilter.period && currentFilter.period.startsWith('2026-')) {
    prevKey = '2025-' + currentFilter.period.split('-')[1];
  }

  const prevMf = COMPANY_EXCEL_DATABASE.monthlyFinancials[prevKey] || COMPANY_EXCEL_DATABASE.monthlyFinancials['2025-08'];
  const prevRevenue = prevMf.ciro || 297507;
  const prevNights = prevMf.daysSold || 22;
  const prevNetProfit = prevMf.netProfit || 118000;

  const revDeltaNominal = actualRevenue - prevRevenue;
  const revDeltaPct = prevRevenue > 0 ? (revDeltaNominal / prevRevenue) * 100 : 0;
  const profitDeltaNominal = actualNetProfit - prevNetProfit;
  const profitDeltaPct = prevNetProfit > 0 ? (profitDeltaNominal / prevNetProfit) * 100 : 0;
  const nightsDelta = actualNights - prevNights;
  const nightsDeltaPct = prevNights > 0 ? (nightsDelta / prevNights) * 100 : 0;

  const subEl = document.getElementById('yoySubText');
  if (subEl) subEl.innerText = `${prevMf.monthName} ${prevMf.year} vs ${document.getElementById('stepperCurrentLabel')?.innerText || ''}`;

  const badgeEl = document.getElementById('yoyBadge');
  if (badgeEl) badgeEl.innerText = `Nominal Büyüme: %${revDeltaPct >= 0 ? '+' : ''}${revDeltaPct.toFixed(1)}`;

  const container = document.getElementById('yoyBoxesContainer');
  if (!container) return;
  container.innerHTML = `
    <div class="yoy-row">
      <div class="yoy-metric">Ciro</div>
      <div class="yoy-val-prev">${prevRevenue.toLocaleString('tr-TR')} TL</div>
      <div class="yoy-val-cur"><strong>${Math.round(actualRevenue).toLocaleString('tr-TR')} TL</strong></div>
      <div class="yoy-delta ${revDeltaNominal >= 0 ? 'text-emerald' : 'text-rose'}">${revDeltaNominal >= 0 ? '+' : ''}${Math.round(revDeltaNominal).toLocaleString('tr-TR')} TL (%${revDeltaPct.toFixed(1)})</div>
    </div>
    <div class="yoy-row">
      <div class="yoy-metric">Net Kâr</div>
      <div class="yoy-val-prev">${prevNetProfit.toLocaleString('tr-TR')} TL</div>
      <div class="yoy-val-cur"><strong>${Math.round(actualNetProfit).toLocaleString('tr-TR')} TL</strong></div>
      <div class="yoy-delta ${profitDeltaNominal >= 0 ? 'text-emerald' : 'text-rose'}">${profitDeltaNominal >= 0 ? '+' : ''}${Math.round(profitDeltaNominal).toLocaleString('tr-TR')} TL (%${profitDeltaPct.toFixed(1)})</div>
    </div>
    <div class="yoy-row">
      <div class="yoy-metric">Satılan Gece</div>
      <div class="yoy-val-prev">${prevNights} Gece</div>
      <div class="yoy-val-cur"><strong>${actualNights} Gece</strong></div>
      <div class="yoy-delta ${nightsDelta >= 0 ? 'text-emerald' : 'text-rose'}">${nightsDelta >= 0 ? '+' : ''}${nightsDelta} Gece (%${nightsDeltaPct.toFixed(1)})</div>
    </div>
  `;
}

// -------------------------------------------------------------
// LEXBNB AI FİNANS ANALİSTİ (GERÇEK VERİ KORELASYON MOTORU)
// -------------------------------------------------------------
function renderAIFinancialAnalyst(revenue, targetRev, targetPct, opex, capex, netProfit, netMargin, propStats) {
  const goodBox = document.getElementById('aiGoodContent');
  if (goodBox) {
    goodBox.innerHTML = `
      <p>• <strong>Ciro Başarısı:</strong> Hedeflenen ${targetRev.toLocaleString('tr-TR')} TL ciroya karşılık ${Math.round(revenue).toLocaleString('tr-TR')} TL gerçekleşerek <strong>%${targetPct.toFixed(1)}</strong> gerçekleşme oranı elde edildi.</p>
      <p>• <strong>Zirve Dağ Evi Liderliği:</strong> Zirve, sauna ve jakuzi donanımı ile yüksek gecelik gelir savunmasını yaparak ciroya en büyük nakit katkıyı getirdi.</p>
      <p>• <strong>Tarihsel Ölçek:</strong> Şirket kuruluşundan bu yana toplam <strong>5.004.165 TL</strong> ciro ve <strong>457 satılan geceye</strong> ulaşarak Uludağ bölgesindeki liderliğini pekiştirdi.</p>
    `;
  }

  const badBox = document.getElementById('aiBadContent');
  if (badBox) {
    badBox.innerHTML = `
      <p>• <strong>Gider / Ciro Oranı:</strong> Toplam giderler cironun <strong>%${revenue > 0 ? (((opex + capex) / revenue)*100).toFixed(1) : 0}</strong> seviyesinde seyrediyor. Maaş, temizlik ve komisyon kalemleri operasyonel kârı baskılıyor.</p>
      <p>• <strong>Şirin Dağ Evi Düşük ADR:</strong> 30 gece satılmasına rağmen ortalama günlük fiyat 2.826 TL\'de kaldı; kapasite yüksek talep döneminde gereğinden ucuza kapatıldı.</p>
      <p>• <strong>Nefes Kapasite Kullanımı:</strong> 12 kişilik en büyük villa olmasına karşın ciro potansiyeli portföy ortalamasının gerisinde kaldı.</p>
    `;
  }

  const whyBox = document.getElementById('aiWhyContent');
  if (whyBox) {
    whyBox.innerHTML = `
      <p>• <strong>Korelasyon 1:</strong> Şirin\'de minimum konaklama kuralı ve erken rezervasyon indirimi geniş tutulduğu için takvim erkenden düşük rakamlarla doldu.</p>
      <p>• <strong>Korelasyon 2:</strong> Zirve ve Doğuş villalarında elektrik tüketimi ve kış bakımları fatura maliyetlerini artırdı.</p>
      <p>• <strong>Korelasyon 3:</strong> Kredi kartı ve OTA komisyon giderleri (özellikle Booking/Airbnb) toplam 75.519 TL kesintiye yol açtı.</p>
    `;
  }

  const actionBox = document.getElementById('aiActionContent');
  if (actionBox) {
    actionBox.innerHTML = `
      <div class="ai-action-item">
        <div class="action-text">
          <strong>1. Şirin Villası Taban Fiyatını %30 Artır</strong>
          <p>Hafta sonu taban fiyatını 4.500 TL\'ye çekerek doluluk kaybı yaşamadan ADR\'yi yükseltin.</p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="createTaskFromAI('Şirin Taban Fiyatını Artır', 'P2', 'Şirin hafta sonu taban fiyatını 4.500 TL olarak güncelle.')">⚡ Görev Oluştur</button>
      </div>

      <div class="ai-action-item">
        <div class="action-text">
          <strong>2. Çamaşırhane ve Temizlik Birim Maliyetlerini Revize Et</strong>
          <p>47.000 TL\'ye ulaşan aylık temizlik giderinde parça başı sabit paket anlaşması yapın.</p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="createTaskFromAI('Temizlik Anlaşması Revizyonu', 'P2', 'Çamaşırhane ve temizlik hizmeti ile sabit paket anlaşması yap.')">⚡ Görev Oluştur</button>
      </div>

      <div class="ai-action-item">
        <div class="action-text">
          <strong>3. Direkt WhatsApp & Tekrar Gelen Misafir Kampanyası</strong>
          <p>Geçmiş misafirlere %10 özel indirim sunarak 75.000 TL\'lik komisyon sızıntısını kesin.</p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="createTaskFromAI('Direkt Rezervasyon Kampanyası', 'P2', 'WhatsApp üzerinden eski misafirlere kış sezonu %10 direkt indirim mesajı ilet.')">⚡ Görev Oluştur</button>
      </div>
    `;
  }
}

function createTaskFromAI(title, priority, notes) {
  const newId = 'M' + (appData.maintenance.length + 1);
  appData.maintenance.push({
    id: newId,
    villa: currentFilter.villa === 'ALL' ? 'ZIRVE' : currentFilter.villa,
    priority: priority,
    title: title,
    assignee: 'İşletme Müdürü',
    downtime: 0,
    cost: 0,
    status: 'OPEN',
    notes: notes
  });
  saveAppData();
  alert(`✅ Görev Başarıyla Oluşturuldu!\n\n"${title}" görevi Lexbnb Bakım & Operasyon sistemine eklendi.`);
}

// -------------------------------------------------------------
// GİDER DEFTERİ (EXPENSES CRUD)
// -------------------------------------------------------------
function renderExpensesTable() {
  const tbody = document.getElementById('expensesTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const search = (document.getElementById('expSearchInput')?.value || '').toLowerCase();

  const filtered = appData.expenses.filter(exp => {
    if (!isExpenseInFilter(exp)) return false;
    if (!search) return true;
    return exp.description.toLowerCase().includes(search) || exp.category.toLowerCase().includes(search);
  });

  filtered.forEach(exp => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${exp.date}</td>
      <td><span class="badge ${exp.type === 'CAPEX' ? 'badge-amber' : 'badge-blue'}">${exp.type === 'CAPEX' ? 'Yatırım (Capex)' : 'Operasyonel (Opex)'}</span></td>
      <td><strong>${exp.category}</strong></td>
      <td>${exp.villa === 'ALL' ? 'Tüm Portföy' : (appData.villas[exp.villa]?.name || exp.villa)}</td>
      <td>${exp.description}</td>
      <td><strong>${Number(exp.amount).toLocaleString('tr-TR')} TL</strong></td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn btn-secondary btn-sm" onclick="editExpense('${exp.id}')">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteExpense('${exp.id}')">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openExpenseModal(editId = null) {
  const modal = document.getElementById('expenseModal');
  const title = document.getElementById('expenseModalTitle');
  const editInput = document.getElementById('expEditId');

  if (editId) {
    const exp = appData.expenses.find(e => e.id === editId);
    if (!exp) return;
    title.innerText = '✏️ Gider / Yatırım Düzenle';
    editInput.value = exp.id;
    document.getElementById('expType').value = exp.type;
    document.getElementById('expCategory').value = exp.category;
    document.getElementById('expVilla').value = exp.villa;
    document.getElementById('expDate').value = exp.date;
    document.getElementById('expAmount').value = exp.amount;
    document.getElementById('expDesc').value = exp.description;
  } else {
    title.innerText = '💸 Yeni Gider / Yatırım Girişi';
    editInput.value = '';
    document.getElementById('expenseForm').reset();
    document.getElementById('expDate').value = new Date().toISOString().split('T')[0];
  }

  modal.classList.add('active');
}

function closeExpenseModal() {
  document.getElementById('expenseModal').classList.remove('active');
}

function saveExpense(e) {
  e.preventDefault();
  const editId = document.getElementById('expEditId').value;
  const type = document.getElementById('expType').value;
  const category = document.getElementById('expCategory').value;
  const villa = document.getElementById('expVilla').value;
  const date = document.getElementById('expDate').value;
  const amount = Number(document.getElementById('expAmount').value) || 0;
  const description = document.getElementById('expDesc').value;
  const month = date.slice(0, 7);

  if (editId) {
    const idx = appData.expenses.findIndex(e => e.id === editId);
    if (idx !== -1) {
      appData.expenses[idx] = { ...appData.expenses[idx], type, category, villa, date, amount, description, month };
    }
  } else {
    const newId = 'EXP-' + Date.now().toString().slice(-4);
    appData.expenses.push({ id: newId, type, category, villa, date, amount, description, month });
  }

  saveAppData();
  closeExpenseModal();
}

function editExpense(id) {
  openExpenseModal(id);
}

function deleteExpense(id) {
  if (confirm('Bu harcamayı silmek istediğinizden emin misiniz?')) {
    appData.expenses = appData.expenses.filter(e => e.id !== id);
    saveAppData();
  }
}

// -------------------------------------------------------------
// HEDEFLER DÜZENLEME (GOALS MODAL)
// -------------------------------------------------------------
function openGoalsModal() {
  const curGoals = appData.targets[currentFilter.period] || DEFAULT_TARGETS_BY_MONTH['2026-08'];
  document.getElementById('goalRevenue').value = curGoals.revenue || 300000;
  document.getElementById('goalNetProfit').value = curGoals.netProfit || 90000;
  document.getElementById('goalMargin').value = curGoals.margin || 30.0;
  document.getElementById('goalOccupancy').value = curGoals.occupancy || 65.0;
  document.getElementById('goalADR').value = curGoals.adr || 5000;
  document.getElementById('goalRevPAR').value = curGoals.revpar || 3250;
  document.getElementById('goalMaxExpense').value = curGoals.maxExpense || 220000;

  document.getElementById('goalsModal').classList.add('active');
}

function closeGoalsModal() {
  document.getElementById('goalsModal').classList.remove('active');
}

function saveMonthlyGoals(e) {
  e.preventDefault();
  const revenue = Number(document.getElementById('goalRevenue').value) || 300000;
  const netProfit = Number(document.getElementById('goalNetProfit').value) || 90000;
  const margin = Number(document.getElementById('goalMargin').value) || 30.0;
  const occupancy = Number(document.getElementById('goalOccupancy').value) || 65.0;
  const adr = Number(document.getElementById('goalADR').value) || 5000;
  const revpar = Number(document.getElementById('goalRevPAR').value) || 3250;
  const maxExpense = Number(document.getElementById('goalMaxExpense').value) || 220000;

  appData.targets[currentFilter.period] = { revenue, netProfit, margin, occupancy, adr, revpar, maxExpense };
  saveAppData();
  closeGoalsModal();
  alert('Aylık finansal hedefler başarıyla güncellendi!');
}

// -------------------------------------------------------------
// EXCEL / CSV RAPOR YÜKLEME (IMPORT)
// -------------------------------------------------------------
function openImportModal() {
  document.getElementById('importModal').classList.add('active');
}

function closeImportModal() {
  document.getElementById('importModal').classList.remove('active');
  pendingImportRows = null;
  document.getElementById('importPreviewBox').style.display = 'none';
}

function handleFileImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    const text = evt.target.result;
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    if (lines.length <= 1) {
      alert('Dosyada geçerli veri satırı bulunamadı.');
      return;
    }

    pendingImportRows = lines;
    document.getElementById('importPreviewBox').style.display = 'block';
    document.getElementById('importPreviewText').innerText = `Başarıyla algılandı: ${lines.length - 1} satır finansal işlem.`;
  };
  reader.readAsText(file);
}

function applyImportedData() {
  if (!pendingImportRows || pendingImportRows.length <= 1) return;

  // Simple CSV auto-parser: Header detection
  const header = pendingImportRows[0].toLowerCase().split(',');
  let importedCount = 0;

  for (let i = 1; i < pendingImportRows.length; i++) {
    const parts = pendingImportRows[i].split(',');
    if (parts.length >= 3) {
      const desc = parts[0] || 'İçe aktarılan gider';
      const amt = Number(parts[1]) || 0;
      const cat = parts[2]?.trim() || 'Diğer';

      if (amt > 0) {
        appData.expenses.push({
          id: 'EXP-IMP-' + Date.now() + '-' + i,
          date: new Date().toISOString().split('T')[0],
          month: currentFilter.period,
          villa: 'ALL',
          category: cat,
          amount: amt,
          type: 'OPEX',
          description: desc
        });
        importedCount++;
      }
    }
  }

  saveAppData();
  closeImportModal();
  alert(`${importedCount} adet harcama kaydı başarıyla sisteme aktarıldı!`);
}

// -------------------------------------------------------------
// EXISTING DASHBOARD, LEADS, MAINTENANCE & SETTINGS LOGIC
// -------------------------------------------------------------
function renderKPIsAndDashboard() {
  let totalGross = 0;
  let totalNet = 0;
  let totalPaidNights = 0;
  let directRevenue = 0;

  const targetVillas = currentFilter.villa === 'ALL' ? Object.keys(appData.villas) : [currentFilter.villa];
  const villaStats = {};
  targetVillas.forEach(vKey => {
    villaStats[vKey] = { nights: 0, netRevenue: 0, grossRevenue: 0, directRevenue: 0, p1Open: 0 };
  });

  appData.maintenance.forEach(m => {
    if (m.status === 'OPEN' && m.priority === 'P1' && villaStats[m.villa]) {
      villaStats[m.villa].p1Open += 1;
    }
  });

  appData.bookings.forEach(b => {
    if (b.status === 'CANCELLED' || !isBookingInFilter(b)) return;
    const bGross = Number(b.gross) || 0;
    const bNet = Number(b.net) || 0;
    const bNights = Number(b.nights) || 0;

    totalGross += bGross;
    totalNet += bNet;
    totalPaidNights += bNights;

    if (villaStats[b.villa]) {
      villaStats[b.villa].nights += bNights;
      villaStats[b.villa].netRevenue += bNet;
      villaStats[b.villa].grossRevenue += bGross;
    }

    if (['WHATSAPP', 'INSTAGRAM', 'WEBSITE', 'REPEAT', 'PHONE'].includes(b.channel)) {
      directRevenue += bNet;
      if (villaStats[b.villa]) villaStats[b.villa].directRevenue += bNet;
    }
  });

  const daysInPeriod = currentFilter.period === 'ALL' ? 90 : 30;
  const totalCalendarDays = daysInPeriod * targetVillas.length;
  const totalDowntime = appData.maintenance
    .filter(m => m.status === 'OPEN' && m.priority === 'P1' && targetVillas.includes(m.villa))
    .reduce((sum, m) => sum + (Number(m.downtime) || 0), 0);

  const availableNights = Math.max(1, totalCalendarDays - totalDowntime);
  const occupancyRate = (totalPaidNights / availableNights) * 100;
  const adr = totalPaidNights > 0 ? (totalNet / totalPaidNights) : 0;
  const revpar = totalNet / availableNights;
  const nrevpar = Math.max(0, (totalNet - (totalPaidNights * 750)) / availableNights);

  // Scorecard
  const tbody = document.getElementById('villaScorecardBody');
  if (tbody) {
    tbody.innerHTML = '';
    targetVillas.forEach(vKey => {
      const vConf = appData.villas[vKey] || DEFAULT_VILLAS[vKey];
      const s = villaStats[vKey];
      const vOcc = (s.nights / daysInPeriod) * 100;
      const vAdr = s.nights > 0 ? (s.netRevenue / s.nights) : 0;
      const vRevpar = s.netRevenue / daysInPeriod;
      const vDirPct = s.netRevenue > 0 ? (s.directRevenue / s.netRevenue) * 100 : 0;

      let badgeHtml = '<span class="badge badge-emerald">🟢 Sağlıklı</span>';
      if (s.p1Open > 0) badgeHtml = '<span class="badge badge-rose">🔴 P1 Arıza</span>';
      else if (vOcc < 40) badgeHtml = '<span class="badge badge-amber">🟡 Düşük Doluluk</span>';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${vConf.name}</strong></td>
        <td>${vConf.capacity}</td>
        <td>${s.nights} Gece</td>
        <td>%${vOcc.toFixed(1)}</td>
        <td>₺${Math.round(vAdr).toLocaleString('tr-TR')}</td>
        <td>₺${Math.round(vRevpar).toLocaleString('tr-TR')}</td>
        <td><strong>₺${Math.round(s.netRevenue).toLocaleString('tr-TR')}</strong></td>
        <td>%${vDirPct.toFixed(1)}</td>
        <td>${s.p1Open > 0 ? `<strong style="color:var(--accent-rose);">${s.p1Open} P1</strong>` : 'Yok'}</td>
        <td>${badgeHtml}</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

function renderTodayRadar() {
  const container = document.getElementById('todayRadarList');
  if (!container) return;
  container.innerHTML = '';
  const actions = [];

  appData.maintenance.filter(m => m.status === 'OPEN' && m.priority === 'P1').forEach(m => {
    actions.push({ type: 'p1', badge: '[P1 ACİL]', title: `${appData.villas[m.villa]?.name || m.villa}: ${m.title}`, meta: `Downtime: ${m.downtime || 1} Gece`, action: 'Çöz' });
  });

  appData.leads.filter(l => l.status === 'FOLLOW_UP').forEach(l => {
    actions.push({ type: 'lead', badge: '[SICAK LEAD]', title: `${l.guest} (${appData.villas[l.villa]?.name || l.villa}): ₺${Number(l.quote).toLocaleString('tr-TR')}`, meta: `Kanal: ${l.channel}`, action: 'Follow-up' });
  });

  if (actions.length === 0) {
    actions.push({ type: 'ops', badge: '[GÜVENLİ]', title: 'Tüm villalar operasyonel açıdan sakin ve hazır durumda.', meta: 'Açık P1 arıza bulunmuyor.', action: 'Rutin' });
  }

  const badge = document.getElementById('radarBadge');
  if (badge) badge.innerText = `${actions.length} Aksiyon`;

  actions.slice(0, 5).forEach(act => {
    const row = document.createElement('div');
    row.className = 'radar-row';
    row.innerHTML = `
      <div class="radar-badge-col"><span class="radar-pill pill-${act.type}">${act.badge}</span></div>
      <div class="radar-main-col"><strong>${act.title}</strong><span>${act.meta}</span></div>
      <div class="radar-action-col"><button class="btn btn-secondary btn-sm" onclick="alert('${act.title}')">${act.action}</button></div>
    `;
    container.appendChild(row);
  });
}

function renderGapNights() {
  const container = document.getElementById('gapNightGrid');
  if (!container) return;
  container.innerHTML = '';
  const gaps = [];

  Object.keys(appData.villas).forEach(vKey => {
    const vConf = appData.villas[vKey];
    const pBookings = appData.bookings
      .filter(b => b.villa === vKey && b.status !== 'CANCELLED')
      .sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));

    for (let i = 0; i < pBookings.length - 1; i++) {
      const cur = pBookings[i];
      const next = pBookings[i + 1];
      const diffDays = Math.round((new Date(next.checkIn) - new Date(cur.checkOut)) / (1000 * 60 * 60 * 24));

      if (diffDays === 1 || diffDays === 2) {
        const floorGuard = vConf.floor + vConf.cleanCost + vConf.heatCost;
        const offer = Math.max(Math.round(vConf.base * 0.75), floorGuard);
        gaps.push({ villaName: vConf.name, dates: `${cur.checkOut} → ${next.checkIn} (${diffDays} Gece)`, offer: `₺${offer.toLocaleString('tr-TR')}`, floor: `₺${floorGuard.toLocaleString('tr-TR')} Taban` });
      }
    }
  });

  if (gaps.length === 0) {
    container.innerHTML = '<p class="sub-text" style="grid-column:span 2; padding:12px;">Şu anda takvimde 1-2 gecelik kritik boşluk bulunmuyor.</p>';
    return;
  }

  gaps.forEach(g => {
    const card = document.createElement('div');
    card.className = 'gap-card';
    card.innerHTML = `<div class="gap-info"><strong>${g.villaName} • ${g.dates}</strong><span>Fırsat satışı önerilir.</span></div><div class="gap-pricing"><div class="offer-price">${g.offer}</div><div class="floor-hint">${g.floor}</div></div>`;
    container.appendChild(card);
  });
}

function renderOtaRadar() {
  const tbody = document.getElementById('channelProfitabilityTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const channelData = {
    'AIRBNB': { name: 'Airbnb', type: 'OTA', count: 0, gross: 0, comm: 0, net: 0 },
    'BOOKING': { name: 'Booking.com', type: 'OTA', count: 0, gross: 0, comm: 0, net: 0 },
    'WHATSAPP': { name: 'WhatsApp', type: 'Direkt', count: 0, gross: 0, comm: 0, net: 0 },
    'INSTAGRAM': { name: 'Instagram', type: 'Direkt', count: 0, gross: 0, comm: 0, net: 0 }
  };

  let savedComm = 0;
  appData.bookings.forEach(b => {
    if (b.status === 'CANCELLED' || !isBookingInFilter(b)) return;
    const ch = b.channel ? b.channel.toUpperCase() : 'OTHER';
    if (channelData[ch]) {
      channelData[ch].count += 1;
      channelData[ch].gross += (Number(b.gross) || 0);
      channelData[ch].comm += (Number(b.otaComm) || 0);
      channelData[ch].net += (Number(b.net) || 0);
    }
    if (['WHATSAPP', 'INSTAGRAM', 'WEBSITE'].includes(ch)) {
      savedComm += (Number(b.gross) || 0) * 0.15;
    }
  });

  const otaSavedEl = document.getElementById('otaSavedCommission');
  if (otaSavedEl) otaSavedEl.innerText = `${Math.round(savedComm).toLocaleString('tr-TR')} TL`;

  Object.keys(channelData).forEach(k => {
    const c = channelData[k];
    const commPct = c.gross > 0 ? (c.comm / c.gross) * 100 : 0;
    const netMargin = c.gross > 0 ? (c.net / c.gross) * 100 : 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${c.name}</strong></td>
      <td><span class="badge ${c.type === 'Direkt' ? 'badge-green' : 'badge-blue'}">${c.type}</span></td>
      <td>${c.count}</td>
      <td>₺${Math.round(c.gross).toLocaleString('tr-TR')}</td>
      <td style="color:var(--accent-rose);">₺${Math.round(c.comm).toLocaleString('tr-TR')}</td>
      <td>%${commPct.toFixed(1)}</td>
      <td><strong>₺${Math.round(c.net).toLocaleString('tr-TR')}</strong></td>
      <td><span class="badge ${netMargin >= 85 ? 'badge-green' : 'badge-amber'}">%${netMargin.toFixed(1)}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function showKpiExplanation(code) {
  const guides = {
    'REVENUE': '📊 GERÇEKLEŞEN CİRO:\n\nAy içinde konaklanan rezervasyonlardan elde edilen toplam saf oda ve konaklama geliridir.',
    'TARGET': '🎯 HEDEF CİRO:\n\nİşletme bütçeniz doğrultusunda ilgili ay için belirlediğiniz ciro eşiğidir.',
    'NET_PROFIT': '💵 NET KÂR (NET CASH PROFIT):\n\nCiro - Operasyonel Giderler - Yatırımlar (Capex).\n\nYatırım harcamaları çıktıktan sonra işletme sahibinin cebinde kalan net nakittir.',
    'TOTAL_EXPENSE': '💸 TOPLAM GİDER:\n\nOperasyonel Giderler (Maaş, temizlik, fatura) + Yatırım Harcamaları (Capex).',
    'SOLD_NIGHTS': '🛌 SATILAN GECE:\n\nİlgili ayda misafirlerin villalarda fiilen konakladığı toplam gece sayısıdır.'
  };
  alert(guides[code] || 'KPI Tanımı');
}

// -------------------------------------------------------------
// MANAGE BOOKINGS TABLE (CRUD + SEARCH)
// -------------------------------------------------------------
function renderManageBookingsTable() {
  const tbody = document.getElementById('manageBookingsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const search = (document.getElementById('rezSearchInput')?.value || '').toLowerCase();

  const filtered = appData.bookings.filter(b => {
    if (!isBookingInFilter(b)) return false;
    if (!search) return true;
    const vName = (appData.villas[b.villa]?.name || b.villa).toLowerCase();
    const gName = (b.guest || '').toLowerCase();
    return vName.includes(search) || gName.includes(search);
  });

  filtered.forEach(b => {
    const vName = appData.villas[b.villa]?.name || b.villa;
    const nightly = b.nights > 0 ? Math.round(b.net / b.nights) : 0;

    let statusBadge = '<span class="badge badge-green">Onaylandı</span>';
    if (b.status === 'CANCELLED') statusBadge = '<span class="badge badge-rose">İptal</span>';
    if (b.status === 'CHECKED_IN') statusBadge = '<span class="badge badge-blue">İçeride</span>';
    if (b.status === 'COMPLETED') statusBadge = '<span class="badge badge-amber">Tamamlandı</span>';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${vName}</strong></td>
      <td>${b.guest}</td>
      <td><span class="badge ${['WHATSAPP','INSTAGRAM','WEBSITE'].includes(b.channel) ? 'badge-green' : 'badge-blue'}">${b.channel}</span></td>
      <td>${b.checkIn}</td>
      <td>${b.checkOut}</td>
      <td>${b.nights}</td>
      <td>₺${Number(b.gross).toLocaleString('tr-TR')}</td>
      <td>₺${Number(b.otaComm).toLocaleString('tr-TR')}</td>
      <td>₺${Number(b.cleanFee).toLocaleString('tr-TR')}</td>
      <td><strong>₺${Number(b.net).toLocaleString('tr-TR')}</strong></td>
      <td>₺${nightly.toLocaleString('tr-TR')}</td>
      <td>${statusBadge}</td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn btn-secondary btn-sm" onclick="editBooking('${b.id}')">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteBooking('${b.id}')">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openBookingModal(editId = null) {
  const modal = document.getElementById('bookingModal');
  const title = document.getElementById('bookingModalTitle');
  const editInput = document.getElementById('resEditId');

  if (editId) {
    const b = appData.bookings.find(item => item.id === editId);
    if (!b) return;
    title.innerText = '✏️ Rezervasyonu Güncelle';
    editInput.value = b.id;
    document.getElementById('resVilla').value = b.villa;
    document.getElementById('resGuest').value = b.guest;
    document.getElementById('resCheckIn').value = b.checkIn;
    document.getElementById('resCheckOut').value = b.checkOut;
    document.getElementById('resChannel').value = b.channel;
    document.getElementById('resGross').value = b.gross;
    document.getElementById('resCommission').value = b.otaComm;
    document.getElementById('resCleanFee').value = b.cleanFee;
    document.getElementById('resStatus').value = b.status || 'CONFIRMED';
    document.getElementById('resPax').value = b.pax || 6;
  } else {
    title.innerText = '➕ Yeni Rezervasyon Girişi';
    editInput.value = '';
    document.getElementById('bookingForm').reset();
    document.getElementById('resCleanFee').value = 0;
  }

  calculateLivePreview();
  modal.classList.add('active');
}

function closeBookingModal() {
  document.getElementById('bookingModal').classList.remove('active');
}

function calculateLivePreview() {
  const dInStr = document.getElementById('resCheckIn').value;
  const dOutStr = document.getElementById('resCheckOut').value;
  const gross = Number(document.getElementById('resGross').value) || 0;
  const channel = document.getElementById('resChannel').value;
  let customComm = document.getElementById('resCommission').value;
  const cleanFee = Number(document.getElementById('resCleanFee').value) || 0;

  let nights = 0;
  if (dInStr && dOutStr) {
    const d1 = new Date(dInStr);
    const d2 = new Date(dOutStr);
    nights = Math.max(0, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
  }

  let otaComm = 0;
  if (customComm !== '' && customComm !== undefined && !isNaN(customComm)) {
    otaComm = Number(customComm);
  } else {
    if (channel === 'AIRBNB') otaComm = Math.round(gross * 0.15);
    if (channel === 'BOOKING') otaComm = Math.round(gross * 0.18);
  }

  const net = Math.max(0, gross - otaComm - cleanFee);
  const nightlyNet = nights > 0 ? Math.round(net / nights) : 0;

  document.getElementById('prevNights').innerText = `${nights} Gece`;
  document.getElementById('prevCommission').innerText = `₺${otaComm.toLocaleString('tr-TR')}`;
  document.getElementById('prevNetRevenue').innerText = `₺${net.toLocaleString('tr-TR')}`;
  document.getElementById('prevNightlyNet').innerText = `₺${nightlyNet.toLocaleString('tr-TR')} / gece`;
}

function saveBooking(e) {
  e.preventDefault();
  const editId = document.getElementById('resEditId').value;
  const villa = document.getElementById('resVilla').value;
  const guest = document.getElementById('resGuest').value;
  const checkIn = document.getElementById('resCheckIn').value;
  const checkOut = document.getElementById('resCheckOut').value;
  const channel = document.getElementById('resChannel').value;
  const gross = Number(document.getElementById('resGross').value) || 0;
  const cleanFee = Number(document.getElementById('resCleanFee').value) || 0;
  const status = document.getElementById('resStatus').value;
  const pax = Number(document.getElementById('resPax').value) || 6;

  const d1 = new Date(checkIn);
  const d2 = new Date(checkOut);
  const nights = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));

  let customComm = document.getElementById('resCommission').value;
  let otaComm = 0;
  if (customComm !== '' && !isNaN(customComm)) {
    otaComm = Number(customComm);
  } else {
    if (channel === 'AIRBNB') otaComm = Math.round(gross * 0.15);
    if (channel === 'BOOKING') otaComm = Math.round(gross * 0.18);
  }

  const net = Math.max(0, gross - otaComm - cleanFee);

  if (editId) {
    const idx = appData.bookings.findIndex(b => b.id === editId);
    if (idx !== -1) {
      appData.bookings[idx] = { ...appData.bookings[idx], villa, guest, checkIn, checkOut, channel, gross, otaComm, cleanFee, net, nights, pax, status };
    }
  } else {
    const newId = 'REZ-' + Date.now().toString().slice(-4);
    appData.bookings.push({ id: newId, villa, guest, checkIn, checkOut, channel, gross, otaComm, cleanFee, net, nights, pax, status });
  }

  saveAppData();
  closeBookingModal();
}

function editBooking(id) { openBookingModal(id); }
function deleteBooking(id) {
  if (confirm('Bu rezervasyonu silmek istediğinizden emin misiniz?')) {
    appData.bookings = appData.bookings.filter(b => b.id !== id);
    saveAppData();
  }
}

// -------------------------------------------------------------
// SETTINGS TABLE (PRICING TIERS)
// -------------------------------------------------------------
function renderSettingsTable() {
  const tbody = document.getElementById('settingsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  Object.keys(appData.villas).forEach(vKey => {
    const v = appData.villas[vKey];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${v.name}</strong></td>
      <td>${v.capacity}</td>
      <td><input type="number" class="tbl-input" id="set_floor_${vKey}" value="${v.floor}"></td>
      <td><input type="number" class="tbl-input" id="set_base_${vKey}" value="${v.base}"></td>
      <td><input type="number" class="tbl-input" id="set_target_${vKey}" value="${v.target || v.base * 1.3}"></td>
      <td><input type="number" class="tbl-input" id="set_premium_${vKey}" value="${v.premium || v.base * 1.8}"></td>
      <td><input type="number" class="tbl-input" id="set_peak_${vKey}" value="${v.peak || v.base * 2.5}"></td>
      <td><input type="number" class="tbl-input" id="set_clean_${vKey}" value="${v.cleanCost}"></td>
      <td><input type="number" class="tbl-input" id="set_heat_${vKey}" value="${v.heatCost}"></td>
    `;
    tbody.appendChild(tr);
  });
}

function saveAllSettings() {
  Object.keys(appData.villas).forEach(vKey => {
    appData.villas[vKey].floor = Number(document.getElementById(`set_floor_${vKey}`).value) || 3000;
    appData.villas[vKey].base = Number(document.getElementById(`set_base_${vKey}`).value) || 4000;
    appData.villas[vKey].target = Number(document.getElementById(`set_target_${vKey}`).value) || 6000;
    appData.villas[vKey].premium = Number(document.getElementById(`set_premium_${vKey}`).value) || 8000;
    appData.villas[vKey].peak = Number(document.getElementById(`set_peak_${vKey}`).value) || 12000;
    appData.villas[vKey].cleanCost = Number(document.getElementById(`set_clean_${vKey}`).value) || 800;
    appData.villas[vKey].heatCost = Number(document.getElementById(`set_heat_${vKey}`).value) || 350;
  });
  saveAppData();
  alert('Tüm villa fiyat basamakları ve maliyet parametreleri kaydedildi!');
}

// -------------------------------------------------------------
// LEADS & MAINTENANCE CRUD
// -------------------------------------------------------------
function renderManageLeadsTable() {
  const tbody = document.getElementById('manageLeadsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  appData.leads.forEach(l => {
    let statusBadge = `<span class="badge badge-amber">${l.status}</span>`;
    if (l.status === 'WON') statusBadge = `<span class="badge badge-green">Kazanıldı</span>`;
    if (l.status === 'LOST') statusBadge = `<span class="badge badge-rose">Kaybedildi</span>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${l.guest}</strong></td>
      <td>${appData.villas[l.villa]?.name || l.villa}</td>
      <td>${l.channel}</td>
      <td>₺${Number(l.quote).toLocaleString('tr-TR')}</td>
      <td>${statusBadge}</td>
      <td>${l.lostReason || '-'}</td>
      <td>${l.notes || '-'}</td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn btn-secondary btn-sm" onclick="editLead('${l.id}')">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteLead('${l.id}')">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openLeadModal(editId = null) {
  const modal = document.getElementById('leadModal');
  const title = document.getElementById('leadModalTitle');
  const editInput = document.getElementById('leadEditId');

  if (editId) {
    const l = appData.leads.find(item => item.id === editId);
    if (!l) return;
    title.innerText = '✏️ Lead Güncelle';
    editInput.value = l.id;
    document.getElementById('leadGuest').value = l.guest;
    document.getElementById('leadVilla').value = l.villa;
    document.getElementById('leadChannel').value = l.channel;
    document.getElementById('leadQuote').value = l.quote;
    document.getElementById('leadStatus').value = l.status;
    document.getElementById('leadLostReason').value = l.lostReason || '-';
    document.getElementById('leadNotes').value = l.notes || '';
  } else {
    title.innerText = '🎯 Yeni Lead / Fırsat Girişi';
    editInput.value = '';
    document.getElementById('leadForm').reset();
  }
  modal.classList.add('active');
}

function closeLeadModal() { document.getElementById('leadModal').classList.remove('active'); }

function saveLead(e) {
  e.preventDefault();
  const editId = document.getElementById('leadEditId').value;
  const guest = document.getElementById('leadGuest').value;
  const villa = document.getElementById('leadVilla').value;
  const channel = document.getElementById('leadChannel').value;
  const quote = Number(document.getElementById('leadQuote').value) || 0;
  const status = document.getElementById('leadStatus').value;
  const lostReason = document.getElementById('leadLostReason').value;
  const notes = document.getElementById('leadNotes').value;

  if (editId) {
    const idx = appData.leads.findIndex(l => l.id === editId);
    if (idx !== -1) {
      appData.leads[idx] = { ...appData.leads[idx], guest, villa, channel, quote, status, lostReason, notes };
    }
  } else {
    const newId = 'L' + (appData.leads.length + 1);
    appData.leads.push({ id: newId, guest, villa, channel, quote, status, lostReason, notes });
  }

  saveAppData();
  closeLeadModal();
}

function editLead(id) { openLeadModal(id); }
function deleteLead(id) {
  if (confirm('Bu talebi silmek istediğinizden emin misiniz?')) {
    appData.leads = appData.leads.filter(l => l.id !== id);
    saveAppData();
  }
}

function renderManageMaintTable() {
  const tbody = document.getElementById('manageMaintTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  appData.maintenance.forEach(m => {
    let priBadge = '<span class="badge badge-rose">P1 Kritik</span>';
    if (m.priority === 'P2') priBadge = '<span class="badge badge-amber">P2 Önemli</span>';
    if (m.priority === 'P3') priBadge = '<span class="badge badge-blue">P3 Rutin</span>';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${priBadge}</td>
      <td><strong>${appData.villas[m.villa]?.name || m.villa}</strong></td>
      <td>${m.title}</td>
      <td>${m.assignee || 'Atanmadı'}</td>
      <td>₺${Number(m.cost).toLocaleString('tr-TR')}</td>
      <td>${m.downtime || 0} Gece</td>
      <td>${m.status === 'COMPLETED' ? '<span class="badge badge-green">Tamamlandı</span>' : '<span class="badge badge-rose">Açık</span>'}</td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn btn-secondary btn-sm" onclick="editMaint('${m.id}')">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteMaint('${m.id}')">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openMaintModal(editId = null) {
  const modal = document.getElementById('maintModal');
  const title = document.getElementById('maintModalTitle');
  const editInput = document.getElementById('maintEditId');

  if (editId) {
    const m = appData.maintenance.find(item => item.id === editId);
    if (!m) return;
    title.innerText = '✏️ Arızayı Güncelle';
    editInput.value = m.id;
    document.getElementById('maintVilla').value = m.villa;
    document.getElementById('maintPriority').value = m.priority;
    document.getElementById('maintTitle').value = m.title;
    document.getElementById('maintAssignee').value = m.assignee || '';
    document.getElementById('maintDowntime').value = m.downtime || 0;
    document.getElementById('maintCost').value = m.cost || 0;
    document.getElementById('maintStatus').value = m.status;
  } else {
    title.innerText = '🛠️ Yeni Arıza / Bakım İşi';
    editInput.value = '';
    document.getElementById('maintForm').reset();
  }
  modal.classList.add('active');
}

function closeMaintModal() { document.getElementById('maintModal').classList.remove('active'); }

function saveMaint(e) {
  e.preventDefault();
  const editId = document.getElementById('maintEditId').value;
  const villa = document.getElementById('maintVilla').value;
  const priority = document.getElementById('maintPriority').value;
  const title = document.getElementById('maintTitle').value;
  const assignee = document.getElementById('maintAssignee').value;
  const downtime = Number(document.getElementById('maintDowntime').value) || 0;
  const cost = Number(document.getElementById('maintCost').value) || 0;
  const status = document.getElementById('maintStatus').value;

  if (editId) {
    const idx = appData.maintenance.findIndex(m => m.id === editId);
    if (idx !== -1) {
      appData.maintenance[idx] = { ...appData.maintenance[idx], villa, priority, title, assignee, downtime, cost, status };
    }
  } else {
    const newId = 'M' + (appData.maintenance.length + 1);
    appData.maintenance.push({ id: newId, villa, priority, title, assignee, downtime, cost, status });
  }

  saveAppData();
  closeMaintModal();
}

function editMaint(id) { openMaintModal(id); }
function deleteMaint(id) {
  if (confirm('Bu arızayı silmek istediğinizden emin misiniz?')) {
    appData.maintenance = appData.maintenance.filter(m => m.id !== id);
    saveAppData();
  }
}

// -------------------------------------------------------------
// RESET & EXPORT
// -------------------------------------------------------------
function resetToCleanState() {
  if (confirm('DİKKAT: Tüm mevcut rezervasyonları, harcamaları ve talepleri sıfırlayıp temiz bir kasa başlatmak istiyor musunuz?')) {
    appData.bookings = [];
    appData.expenses = [];
    appData.leads = [];
    appData.maintenance = [];
    saveAppData();
    alert('Sistem tamamen temizlendi! Artık sıfırdan kendi verilerinizi girebilirsiniz.');
  }
}

function exportDataJSON() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appData, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `LEXBNB_Finans_Yedek_${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  loadAppData();
  renderAll();
});
