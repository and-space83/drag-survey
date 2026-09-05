// pilot-anchor 刺激バンク (2026-09-06 に index.html の BLOCKS から分離。文言・構造は不変)。
// 文言の設計正本: ②価値・選好 = research/sources/experiment-design.md §6-3 表 / ③道徳ジレンマ = 同 §6-5「③49問バンク確定表」。
// index.html より前に <script src="bank.js"> で読み込み、BLOCKS.value.bank 等が PILOT_BANK.* を参照する。
// 解析側の同期検証 = tools/pilot-analysis/check_bank_sync.py (本ファイルの value.bank を読む)。バンクを変えたら必ず実行。
// 記法: stem の "|" は文節区切り (表示時に .nb ブロック化・記録からは除去)。id 省略時の itemId は index.html 側で生成。
window.PILOT_BANK = {
  // ===== ② 価値・選好 (Stage 2。experiment-design §6-3。2026-07-29 に②は廃止 = 実施記録として残置・?block=value で回帰確認可) =====
  value: {
    // 項目バンク (§6-3)。各 = 1セル。level: clear(大)/mid(中)/conflict(小)。
    //   セルあたり 2 項目 = 24 項目 (2026-07-07 増強)。第2項目 (id 付き) はユーザーレビュー第1ラウンド
    //   反映済 (2026-07-07)。選定原則: 同属性・同カテゴリで対比 (困惑回避) / 消費財・くじの金額偏重を
    //   避ける (非金額項目を導入)。バンクは「パイロットで調整」前提 (§6-3)。
    //   better: 規範的に優位な肢 ("a"|"b"|null)。conflict は基本 null (金額くじは EV 高い側を記録)。
    //   ev (期待値・円) は金額くじのみ。賞品くじ (お菓子等) は ev なし = §6-4 の EV manipulation check
    //   対象外 (同一賞品の確率支配 (clear) は better で表現)。
    //   id: itemId の明示指定 (省略時 domain-level = 既存12項目の過去データ互換)。
    bank: [
      { domain: "goods", level: "clear",    a: { label: "1万円札1枚" },    b: { label: "10円玉1枚" },     better: "a" }, /* 札1枚vs玉1枚の対比。ユーザー選定 2026-07-07 (旧: 現金1万円) */
      { domain: "goods", level: "clear", id: "goods-clear-2", a: { label: "新品のイヤホン" }, b: { label: "中古のイヤホン" }, better: "a" }, /* 同一物の状態対比 (価格非提示なので新品が支配)。ユーザー選定 2026-07-07 */
      { domain: "goods", level: "mid",      a: { label: "現金9000円" },   b: { label: "商品券10000円" }, better: null }, /* mid: トレードオフ(柔軟性↔金額)。ユーザー選定 2026-06-23 */
      { domain: "goods", level: "mid", id: "goods-mid-2", a: { label: "デザイン重視の靴" }, b: { label: "履き心地重視の靴" }, better: null }, /* mid: トレードオフ(見た目↔実用)。非金額 (金額偏重の回避、ユーザー方針 2026-07-07)。承認済 2026-07-07 R2 */
      { domain: "goods", level: "conflict", a: { label: "図書カード1000円" }, b: { label: "ドリンク券1000円" }, better: null, conflictType: "approach" }, /* approach: 同額(1000円)で互いに支配しない (本のみ↔飲料のみ)。ユーザー指摘 2026-06-23 */
      { domain: "goods", level: "conflict", id: "goods-conflict-2", a: { label: "映画チケット1枚" }, b: { label: "好きな漫画1冊" }, better: null, conflictType: "approach" }, /* approach: 娯楽同士・非金額・非支配。承認済 2026-07-07 R2 */
      { domain: "lottery", level: "clear",    a: { label: "80%で1000円", ev: 800 }, b: { label: "20%で1000円", ev: 200 }, better: "a" },
      { domain: "lottery", level: "clear", id: "lottery-clear-2", a: { label: "90%でアイス" }, b: { label: "10%でガム" }, better: "a" }, /* 賞品くじ (確率も賞品も a が優位=二重支配、ev不要)。同一賞品×確率違いは不自然とのレビューで差し替え 2026-07-07 R2。承認済 (R3 で24項目完全確定) */
      { domain: "lottery", level: "mid",      a: { label: "70%で1000円", ev: 700 }, b: { label: "確実に500円", ev: 500 }, better: "a" }, /* mid: EVトレードオフ(700↔500)。ユーザー選定 2026-06-23 */
      { domain: "lottery", level: "mid", id: "lottery-mid-2", a: { label: "70%でジュース2本" }, b: { label: "確実にジュース1本" }, better: null }, /* 賞品くじ (量×リスクのトレードオフ)。旧「80%で1500円/確実に1000円」は EV差200 が mid-1 と重複+金額ばかりで味気ないとのレビューで転換 2026-07-07 R3。金額くじは3項目 (EV差600/200/50) で §6-4 EV規範を維持 */
      { domain: "lottery", level: "conflict", a: { label: "確実に500円", ev: 500 }, b: { label: "50%で1100円", ev: 550 }, better: "b", conflictType: "approach" },
      { domain: "lottery", level: "conflict", id: "lottery-conflict-2", a: { label: "確実にコーヒー1杯" }, b: { label: "50%でケーキセット" }, better: null, conflictType: "approach" }, /* 賞品くじ (価値が通約不能=真の拮抗、規範なし)。承認済 2026-07-07 R2 */
      { domain: "food", level: "clear",    a: { label: "出来たての好物" }, b: { label: "冷めた好物" }, better: "a" }, /* 同一物の鮮度対比。food-mid にも「冷めた好物」が出るが「選択肢が同じでも問題は別」としてユーザー確定 2026-07-07 R2 */
      { domain: "food", level: "clear", id: "food-clear-2", a: { label: "焼きたてのパン" }, b: { label: "伸びきった麺" }, better: "a" }, /* ユーザー選定 2026-07-07 (旧: 伸びきったラーメン) */
      { domain: "food", level: "mid",      a: { label: "出来たてのおにぎり" }, b: { label: "冷めた好物" },  better: null }, /* mid: トレードオフ(鮮度↔好み)。ユーザー選定 2026-06-23 */
      { domain: "food", level: "mid", id: "food-mid-2", a: { label: "好物を一口だけ" }, b: { label: "普通の味で大盛り" }, better: null }, /* mid: トレードオフ(好み↔量)。承認済 2026-07-07 (R3 で24項目完全確定) */
      { domain: "food", level: "conflict", a: { label: "ぬるい麦茶" },     b: { label: "味の薄いせんべい" }, better: null, conflictType: "avoidance" },
      { domain: "food", level: "conflict", id: "food-conflict-2", a: { label: "冷めたポテト" }, b: { label: "ぬるいコーラ" }, better: null, conflictType: "avoidance" }, /* avoidance。ユーザー選定 2026-07-07 (ラベル短縮方針で フライドポテト→ポテト、R3) */
      { domain: "values", level: "clear",    a: { label: "家族との時間" }, b: { label: "広告を見る時間" }, better: "a" }, /* 同属性 (時間の使い方) で対比。ラベル短縮 2026-07-07 R3 (ボックス幅制約) */
      { domain: "values", level: "clear", id: "values-clear-2", a: { label: "親友との信頼" }, b: { label: "他人からのいいね" }, better: "a" }, /* 同カテゴリ (無形の対人価値) で対比。ラベル短縮 2026-07-07 R3 */
      { domain: "values", level: "mid",      a: { label: "趣味の時間" }, b: { label: "昼寝の時間" },     better: null }, /* mid: トレードオフ(両方魅力)。ユーザー選定 2026-06-23 */
      { domain: "values", level: "mid", id: "values-mid-2", a: { label: "旅行の楽しみ" }, b: { label: "貯金の安心" }, better: null }, /* mid: トレードオフ(体験↔安定・両方魅力)。承認済 2026-07-07 (R3 で24項目完全確定) */
      { domain: "values", level: "conflict", a: { label: "満員電車での通勤" }, b: { label: "毎日の残業" }, better: null, conflictType: "avoidance", stem: "どちらかを選ぶなら、|まだマシな方は|どちらですか？" }, /* avoidance (両方避けたい)。ユーザー選定 2026-06-23 */
      { domain: "values", level: "conflict", id: "values-conflict-2", a: { label: "真夏の停電" }, b: { label: "真冬の停電" }, better: null, conflictType: "avoidance", stem: "どちらかを選ぶなら、|まだマシな方は|どちらですか？" }, /* avoidance: 季節のみ変えた対称ペア。ユーザー選定 2026-07-07 (旧: 真冬の断水) */
    ],
    practiceBank: [
      // 1問目=支配優位 (操作の習得)、2問目=トレードオフ (評定リハーサルで尺度の迷い側も1回使う。
      //   易2問だと自信5/迷い1に初期アンカーが偏るというレビューWF指摘 2026-07-07。本バンク24項目とは非重複)
      { domain: "practice", a: { label: "100円もらう" }, b: { label: "1円もらう" }, better: "a", stem: "どちらが欲しいですか？" },
      { domain: "practice", a: { label: "パンの朝食" },   b: { label: "ごはんの朝食" }, better: null, stem: "どちらを選びますか？" },
    ],
  },
  // ===== ③ 道徳ジレンマ (Stage 2。experiment-design §6-5 確定表 = 2026-08-22 R4–R5 で49問確定) =====
  moral: {
    // 項目バンク (§6-5「③49問バンク確定表」が SSOT)。各 = 1セル。7類型×(明確1・中間2・拮抗4)=49問。
    //   mtype: 7類型 (sacrifice/honesty/loyalty/care/promise/autonomy/privacy)。level: clear(明確)/mid(中間)/conflict(拮抗)。
    //   stem = 場面文 (40–70字。"|" は文節区切り: 表示時に .nb ブロック化・記録からは除去 = nbText/stemRecord)。
    //   better: 規範優位肢 ("a"|null)。明確のみ better 定義、中/拮抗は null。
    //   tags = 構造メタ (weight 軽/重, escape 封鎖/あり:*, split 偏る/割れる/100%)。水準操作の層別・探索分析用 (decisions-log 2026-08-18)。
    //   itemId は id 省略時 `${mtype}-${level}` を生成。第二パイロット継続20項目は itemId 不変 (過去データ互換)、新規29は id 明示。
    //   2026-08-22 R4–R5 レビューで49問確定 (定義v2・②廃止に伴う③only 拡張)。旧24項目版は git 履歴。
    bank: [
      { mtype: "sacrifice", level: "clear", stem: "暴走電車が|5人に向かう。|レバーを引けば|電車は|別の線路にそれ、|そちらに人はいない。", a: { label: "レバーを引く" }, b: { label: "何もしない" }, better: "a", tags: { weight: "-", escape: "-", split: "100%" } },
      { mtype: "sacrifice", level: "mid", stem: "暴走電車が|5人に向かう。|レバーを引けば|別の線路にそれるが、|そこにいる|作業員1人が|犠牲になる。", a: { label: "レバーを引く" }, b: { label: "何もしない" }, better: null, tags: { weight: "重", escape: "封鎖", split: "偏る" } },
      { id: "sacrifice-mid-2", mtype: "sacrifice", level: "mid", stem: "病院で有毒ガスが|発生し、|5人の患者の部屋へ|流れている。|換気を切り替えれば|別室の患者1人に|ガスが向かう。", a: { label: "切り替える" }, b: { label: "何もしない" }, better: null, tags: { weight: "重", escape: "封鎖", split: "偏る" } },
      { mtype: "sacrifice", level: "conflict", stem: "暴走電車が|5人の子どもに向かう。|歩道橋で|隣にいる|大柄な人を|あなたの手で|突き落とせば、|電車は止まり|子どもたちは助かる。", a: { label: "突き落とす" }, b: { label: "何もしない" }, better: null, tags: { weight: "重", escape: "封鎖", split: "偏る" } },
      { id: "sacrifice-conflict-2", mtype: "sacrifice", level: "conflict", stem: "紛争地で兵士から|隠れている。|あなたの赤ん坊が|泣き出した。|口を塞げば|全員が助かるが、|赤ん坊は窒息してしまう。|塞がなければ|全員が見つかる。", a: { label: "口を塞ぐ" }, b: { label: "何もしない" }, better: null, tags: { weight: "重", escape: "封鎖", split: "偏る" } },
      { id: "sacrifice-conflict-3", mtype: "sacrifice", level: "conflict", stem: "船が沈み、|あなたは満員の|救命ボートにいる。|ふちにしがみつく|1人の手を|引きはがせば|その人は波にのまれ、|はがさなければ|ボートごと全員が沈む。", a: { label: "手を引きはがす" }, b: { label: "何もしない" }, better: null, tags: { weight: "重", escape: "封鎖", split: "偏る" } },
      { id: "sacrifice-conflict-4", mtype: "sacrifice", level: "conflict", stem: "崖で滑落した仲間が|あなたの片手に|ぶら下がる。|上の2人とあなたの|命綱を留める杭が|抜けかけている。|離さなければ全員が、|離せば仲間だけが落ちる。", a: { label: "手を離す" }, b: { label: "掴み続ける" }, better: null, tags: { weight: "重", escape: "封鎖", split: "偏る" } },
      { mtype: "honesty", level: "clear", stem: "レジで店員が誤って|お釣りを|1万円多く渡した。|あなたは気づいている。", a: { label: "店員に伝える" }, b: { label: "黙って受け取る" }, better: "a", tags: { weight: "-", escape: "-", split: "100%" } },
      { mtype: "honesty", level: "mid", stem: "友人が作ってくれた|手料理が|正直おいしくない。|「どうだった?」と|感想を聞かれた。", a: { label: "正直に言う" }, b: { label: "おいしいと言う" }, better: null, tags: { weight: "軽", escape: "あり:工夫", split: "割れる" } },
      { id: "honesty-mid-2", mtype: "honesty", level: "mid", stem: "友人が大きく|イメチェンした髪型を|「似合う?」と聞いてきた。|正直、|前の方が良かったと|思っている。", a: { label: "正直に言う" }, b: { label: "似合うと言う" }, better: null, tags: { weight: "軽", escape: "あり:工夫", split: "割れる" } },
      { mtype: "honesty", level: "conflict", stem: "親友の結婚式当日、|新郎に隠された|不倫の証拠を|偶然見つけた。|式はもう|始まろうとしている。", a: { label: "式の前に伝える" }, b: { label: "黙っておく" }, better: null, tags: { weight: "重", escape: "封鎖", split: "割れる" } },
      { id: "honesty-conflict-2", mtype: "honesty", level: "conflict", stem: "余命を知らされていない|父が「大丈夫だよな」と|あなたに聞いてきた。|本人に伝えるかどうかは、|医師から家族に|任されている。", a: { label: "本当のことを言う" }, b: { label: "大丈夫と言う" }, better: null, tags: { weight: "重", escape: "封鎖", split: "割れる" } },
      { id: "honesty-conflict-3", mtype: "honesty", level: "conflict", stem: "あなたの脇見で|事故が起き、|助手席の|幼なじみに|重い後遺症が|残った。|事故の記憶がない|本人は|不運だったと信じ、|あなたを|支えにしている。", a: { label: "過失を打ち明ける" }, b: { label: "黙っておく" }, better: null, tags: { weight: "重", escape: "封鎖", split: "割れる" } },
      { id: "honesty-conflict-4", mtype: "honesty", level: "conflict", stem: "目の悪い祖母に、|絶縁した叔父から|手紙が届いた。|祖母を責める|言葉ばかりだが、|隠し事の嫌いな|本人は|「全部そのまま|読んでおくれ」と|言う。", a: { label: "そのまま読む" }, b: { label: "変えて読む" }, better: null, tags: { weight: "重", escape: "封鎖", split: "割れる" } },
      { mtype: "loyalty", level: "clear", stem: "資格試験の会場で、|隣の見知らぬ受験生が|カンニングしているのに|気づいた。", a: { label: "試験官に伝える" }, b: { label: "見て見ぬふり" }, better: "a", tags: { weight: "-", escape: "-", split: "100%" } },
      { mtype: "loyalty", level: "mid", stem: "親しい同僚が、|在宅勤務中|ほとんど働かず|遊んでいるのに、|忙しいふりをして|あなたと同じ|給料・評価を得ている。", a: { label: "上司に伝える" }, b: { label: "黙っている" }, better: null, tags: { weight: "軽", escape: "あり:工夫", split: "割れる" } },
      { id: "loyalty-mid-2", mtype: "loyalty", level: "mid", stem: "仲の良い部員が|練習をさぼっていたのに、|あなたの代わりに|大会メンバーに|選ばれようとしている。|監督は気づいていない。", a: { label: "監督に伝える" }, b: { label: "黙っている" }, better: null, tags: { weight: "軽", escape: "あり:工夫", split: "割れる" } },
      { mtype: "loyalty", level: "conflict", stem: "実の兄が|会社ぐるみの不正に|関わっていると知った。|通報すれば|多くの被害者は|救われるが、|兄は逮捕され|兄の家族は|生活を失う。", a: { label: "通報する" }, b: { label: "黙っている" }, better: null, tags: { weight: "重", escape: "封鎖", split: "割れる" } },
      { id: "loyalty-conflict-2", mtype: "loyalty", level: "conflict", stem: "親友と言える同期が、|あなたと仲の良い後輩に|嫌がらせを|繰り返していると知った。|人事に伝えれば|同期は処分され、|黙っていれば|後輩が苦しみ続ける。", a: { label: "人事に伝える" }, b: { label: "黙っている" }, better: null, tags: { weight: "重", escape: "封鎖", split: "割れる" } },
      { id: "loyalty-conflict-3", mtype: "loyalty", level: "conflict", stem: "あなたは体を壊し、|工房を譲ると決めた。|継げるのは1人。|10年支え続けた|弟子は腕も立つ。|そこへ息子が|家族を連れ|「継ぎたい」と|帰ってきた。", a: { label: "息子に継がせる" }, b: { label: "弟子に継がせる" }, better: null, tags: { weight: "重", escape: "封鎖", split: "割れる" } },
      { id: "loyalty-conflict-4", mtype: "loyalty", level: "conflict", stem: "娘の結婚式の朝、|人生を導いてくれた恩師が|危篤だと連絡が来た。|今向かえば|最期に間に合うが、|式には戻れない。", a: { label: "恩師へ行く" }, b: { label: "式に残る" }, better: null, tags: { weight: "重", escape: "封鎖", split: "割れる" } },
      { mtype: "care", level: "clear", stem: "優先席に座る|あなたの前に、|立つのがつらそうな|高齢者が来た。|席は空いていない。", a: { label: "席を譲る" }, b: { label: "座り続ける" }, better: "a", tags: { weight: "-", escape: "-", split: "100%" } },
      { mtype: "care", level: "mid", stem: "人気店の長い行列で、|後ろの人が|「子どもが高熱で|急いでいる」と|順番を譲ってほしいと|頼んできた。", a: { label: "順番を譲る" }, b: { label: "断る" }, better: null, tags: { weight: "軽", escape: "あり:自己犠牲", split: "割れる" } },
      { id: "care-mid-2", mtype: "care", level: "mid", stem: "認知症が進む母は、|もうあなたのことも|思い出せない。|それでも|「家に帰りたい」と繰り返す。|連れて帰れば、|介護の負担は大きく増える。", a: { label: "連れて帰る" }, b: { label: "施設に残す" }, better: null, tags: { weight: "重", escape: "あり:自己犠牲", split: "割れる" } },
      { mtype: "care", level: "conflict", stem: "余命わずかの親友が|入院先で|「最後にこれが食べたい」と、|医師に固く止められた|食べ物を頼んできた。|食べれば|容体が急変する|恐れもある。", a: { label: "持っていく" }, b: { label: "断る" }, better: null, tags: { weight: "重", escape: "封鎖", split: "割れる" } },
      { id: "care-conflict-2", mtype: "care", level: "conflict", stem: "人通りのない道で|人が倒れている。|あなたは第一志望の|最終面接に向かっていて、|立ち止まれば|間に合わない。", a: { label: "助ける" }, b: { label: "面接へ急ぐ" }, better: null, tags: { weight: "重", escape: "封鎖", split: "割れる" } },
      { id: "care-conflict-3", mtype: "care", level: "conflict", stem: "長年連れ添った|老犬が|末期のがんで|苦しんでいる。|痛みを取る|手立てはないと|獣医は言う。|楽にする処置を選べば、|今日が最期の日になる。", a: { label: "処置を頼む" }, b: { label: "そのまま看取る" }, better: null, tags: { weight: "重", escape: "封鎖", split: "割れる" } },
      { id: "care-conflict-4", mtype: "care", level: "conflict", stem: "わが子の心臓を|治せるのは|手術だけだ。|成功すれば|健康になるが、|失敗すれば|もう目を覚まさない。|手術しなければ|数年はもつ。|成功は五分五分だ。", a: { label: "手術を受けさせる" }, b: { label: "手術を見送る" }, better: null, tags: { weight: "重", escape: "封鎖", split: "割れる" } },
      { id: "promise-clear", mtype: "promise", level: "clear", stem: "友人の引っ越しを|手伝うと約束した日の朝、|眠くて面倒になってきた。|休んでも自分は困らないし、|連絡するのも億劫だ。", a: { label: "約束通り行く" }, b: { label: "連絡せず休む" }, better: "a", tags: { weight: "-", escape: "-", split: "100%" } },
      { id: "promise-mid", mtype: "promise", level: "mid", stem: "あなたは職務上、|親しい同僚の|解雇が決まったと知った。|同僚は来週、|マンション購入の|契約をする。|口外が発覚すれば|処分は免れない。", a: { label: "同僚に伝える" }, b: { label: "黙っている" }, better: null, tags: { weight: "重", escape: "あり:リスク賭け", split: "割れる" } },
      { id: "promise-mid-2", mtype: "promise", level: "mid", stem: "子どもと動物園に行くと|約束した日曜、|朝から本降りの雨になった。|子どもは|楽しみにしていて、|行く気でいる。", a: { label: "雨でも行く" }, b: { label: "延期する" }, better: null, tags: { weight: "軽", escape: "あり:工夫", split: "割れる" } },
      { id: "promise-conflict", mtype: "promise", level: "conflict", stem: "親の介護で|地元を離れられない|婚約者に|「ここに残る」と|約束していた。|しばらくたって|会社から|本社への転勤を命じられ、|断れば居場所はない。", a: { label: "転勤を断る" }, b: { label: "転勤を受ける" }, better: null, tags: { weight: "重", escape: "封鎖", split: "割れる" } },
      { id: "promise-conflict-2", mtype: "promise", level: "conflict", stem: "「弟が養子だと明かさない」と|亡き母と約束した。|弟は子の難病の手がかりに|家系の病歴を調べ始めた。|血のつながらない弟が|調べても意味はない。", a: { label: "養子だと明かす" }, b: { label: "黙り続ける" }, better: null, tags: { weight: "重", escape: "封鎖", split: "偏る" } },
      { id: "promise-conflict-3", mtype: "promise", level: "conflict", stem: "「離婚だけはしない」と|泣く子どもに約束した。|夫婦の関係は|もう戻らないところまで冷え、|相手は限界だと|離婚を求めている。", a: { label: "離婚に応じる" }, b: { label: "離婚を断る" }, better: null, tags: { weight: "重", escape: "封鎖", split: "割れる" } },
      { id: "promise-conflict-4", mtype: "promise", level: "conflict", stem: "亡くなった親友から|「死んだら中は見ずに処分して」と|箱を託されていた。|遺された母親が|「形見に何か残したい」と|泣いてすがってくる。", a: { label: "箱を渡す" }, b: { label: "見ずに処分する" }, better: null, tags: { weight: "重", escape: "封鎖", split: "割れる" } },
      { id: "autonomy-clear", mtype: "autonomy", level: "clear", stem: "高齢の父が|電話で言われるまま|ATMで|多額の現金を|振り込もうとしている。|明らかに詐欺の手口だ。", a: { label: "止める" }, b: { label: "任せる" }, better: "a", tags: { weight: "-", escape: "-", split: "100%" } },
      { id: "autonomy-mid", mtype: "autonomy", level: "mid", stem: "祖父が事故を起こし、|家族は免許の返納を|迫っている。|車がなければ|暮らせない山里で、|祖父は|「味方はお前だけだ」と|あなたに頼ってきた。", a: { label: "祖父に味方する" }, b: { label: "家族に味方する" }, better: null, tags: { weight: "重", escape: "あり:自己犠牲", split: "割れる" } },
      { id: "autonomy-mid-2", mtype: "autonomy", level: "mid", stem: "畑で熱中症で倒れて|救急車で運ばれた祖母が、|退院した翌日も|畑に出ようとする。|畑が生きがいだが、|あなたが言えば|祖母は畑をやめる。", a: { label: "やめさせる" }, b: { label: "好きにさせる" }, better: null, tags: { weight: "重", escape: "あり:工夫", split: "割れる" } },
      { id: "autonomy-conflict", mtype: "autonomy", level: "conflict", stem: "引退試合のリングで、|網膜を手術した後輩が|目に強打を受けた。|次に打たれれば失明する。|セコンドのあなたが|タオルを投げれば|試合は終わる。", a: { label: "タオルを投げる" }, b: { label: "最後まで戦わせる" }, better: null, tags: { weight: "重", escape: "封鎖", split: "割れる" } },
      { id: "autonomy-conflict-2", mtype: "autonomy", level: "conflict", stem: "初めての大役を任された部下が|不眠と激やせで限界だ。|山場はあとひと月、|人手の補充は利かない。|本人は続けたいと譲らず、|外す権限はあなたにある。", a: { label: "担当を外す" }, b: { label: "続けさせる" }, better: null, tags: { weight: "重", escape: "封鎖", split: "割れる" } },
      { id: "autonomy-conflict-3", mtype: "autonomy", level: "conflict", stem: "「延命治療はいらない」と|言っていた母が倒れ、|意識が戻る可能性は|極めて低いと告げられた。|延命装置をつけるか、|判断はあなたに委ねられた。", a: { label: "延命を断る" }, b: { label: "延命を頼む" }, better: null, tags: { weight: "重", escape: "封鎖", split: "割れる" } },
      { id: "autonomy-conflict-4", mtype: "autonomy", level: "conflict", stem: "隣家が燃えている。|元消防士の弟が|「中に人がいる」と|飛び込もうとする。|消防の到着まで|あと数分。|力ずくでなら|止められる。", a: { label: "力ずくで止める" }, b: { label: "行かせる" }, better: null, tags: { weight: "重", escape: "封鎖", split: "偏る" } },
      { id: "privacy-clear", mtype: "privacy", level: "clear", stem: "人事部から誤って、|同僚たちの|健康診断の結果が|あなたに送られてきた。|見ても誰にも|分からない。", a: { label: "見ずに知らせる" }, b: { label: "見てから知らせる" }, better: "a", tags: { weight: "-", escape: "-", split: "100%" } },
      { id: "privacy-mid", mtype: "privacy", level: "mid", stem: "家族共用のパソコンに|「友達がいない つらい」と|検索した跡が残っていた。|誰のものかは、|履歴の続きを見れば分かる。", a: { label: "続きを見る" }, b: { label: "見ずに閉じる" }, better: null, tags: { weight: "軽", escape: "あり:工夫", split: "割れる" } },
      { id: "privacy-mid-2", mtype: "privacy", level: "mid", stem: "会社の採用の|最終判断を|あなたが任された。|候補者の名前を検索すると、|仕事と関わりのない|私的なSNSが出てきた。", a: { label: "読んで決める" }, b: { label: "読まずに決める" }, better: null, tags: { weight: "軽", escape: "あり:工夫", split: "割れる" } },
      { id: "privacy-conflict", mtype: "privacy", level: "conflict", stem: "不登校の娘が|「消えたい」とつぶやいた。|理由は誰にも話さない。|日記の鍵を壊して読めば|事情が分かるが、|娘は二度と|心を開かないだろう。", a: { label: "鍵を壊して読む" }, b: { label: "読まずに待つ" }, better: null, tags: { weight: "重", escape: "封鎖", split: "割れる" } },
      { id: "privacy-conflict-2", mtype: "privacy", level: "conflict", stem: "預け先がなく、|明日はアプリで頼んだ|シッターに|一歳のわが子を預ける。|撮影は規約違反と|断られたが、|黙ってカメラを置けば|様子を全て見られる。", a: { label: "カメラを置く" }, b: { label: "置かずに預ける" }, better: null, tags: { weight: "重", escape: "封鎖", split: "割れる" } },
      { id: "privacy-conflict-3", mtype: "privacy", level: "conflict", stem: "隣の家から毎晩、|幼い子の泣き声と|怒鳴り声が聞こえる。|警察も児童相談所も|「証拠がなく動けない」と言う。|今、カーテンの隙間から|虐待が見えている。", a: { label: "撮影する" }, b: { label: "撮影しない" }, better: null, tags: { weight: "重", escape: "封鎖", split: "偏る" } },
      { id: "privacy-conflict-4", mtype: "privacy", level: "conflict", stem: "同居する大学生の弟が|夜中に出歩き、|部屋に鍵をかけ始めた。|警察から弟に連絡も来た。|尋ねても答えない。|扉を壊して入れば|事情が分かるかもしれない。", a: { label: "扉を壊して入る" }, b: { label: "入らずにおく" }, better: null, tags: { weight: "重", escape: "封鎖", split: "割れる" } },
    ],
    practiceBank: [
      // 練習5問ぶんを別々の項目で (2026-09-06: 2問の使い回しをやめる)。価値・選好 (旧②) バンクの中立な項目から採用 =
      // 道徳的な重さがなく本番49問と非重複。1問目=明確 (操作の習得)、以降=トレードオフ (評定リハーサルで尺度の両側を使う)
      { mtype: "practice", id: "practice-1", stem: "どちらが欲しいですか？", a: { label: "1万円札1枚" }, b: { label: "10円玉1枚" }, better: "a" },
      { mtype: "practice", id: "practice-2", stem: "どちらを選びますか？", a: { label: "デザイン重視の靴" }, b: { label: "履き心地重視の靴" }, better: null },
      { mtype: "practice", id: "practice-3", stem: "どちらが欲しいですか？", a: { label: "図書カード1000円" }, b: { label: "ドリンク券1000円" }, better: null },
      { mtype: "practice", id: "practice-4", stem: "どちらのくじを選びますか？", a: { label: "確実にコーヒー1杯" }, b: { label: "50%でケーキセット" }, better: null },
      { mtype: "practice", id: "practice-5", stem: "どちらを選びますか？", a: { label: "映画チケット1枚" }, b: { label: "好きな漫画1冊" }, better: null },
    ],
  },
  // ===== 読速ベースラインの中立短文3本 (約30/45/60字 = ③場面文の字数域。設計と用途は index.html の READING_ON 付近と experiment-design §6-6 項13) =====
  readingSentences: [
    '駅前の書店は、|平日は夜9時まで、|週末は夜8時まで|開いている。',
    '公園の桜は|先週から咲き始め、|今週末には|満開になる見込みで、|多くの人が|花見に訪れるという。',
    '市の図書館は|来月から改修工事のため|休館になり、|貸し出し中の本の返却は|駅前の分館で|受け付けると、|利用者に案内が届いた。',
  ],
};
