'use strict';
const fs=require('node:fs'),path=require('node:path');
const dir=__dirname,read=n=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'));
const raw=read('data-audit-results.json'),training=read('training-provenance-results.json'),source=read('static-contract.json');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const row=(a,b,c)=>`<tr><th>${esc(a)}</th><td>${esc(b)}</td><td>${esc(c)}</td></tr>`;
const count=r=>r.checks.filter(c=>c.pass??c.passed).length;
const all=r=>r.checks.every(c=>c.pass??c.passed)&&!r.errors?.length;
const passed=all(raw)&&all(training);
const checks=(title,r,file)=>`<details><summary>${esc(title)}：${count(r)}項目・${all(r)?'全て合格':'要確認'}</summary><p><a href="${file}">詳細JSON</a></p><ul>${r.checks.map(c=>`<li class="${c.pass??c.passed?'ok':'ng'}">${c.pass??c.passed?'✓':'×'} ${esc(c.name)}</li>`).join('')}</ul></details>`;
const staticRows=source.assets.map(a=>row(a.file,a.same?'変更なし':'差分あり／新設',a.same?'ファイル全体のLF正規化SHA一致':'挙動は実行テストで別に検査')).join('');
const doc=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>記録データの新旧比較</title><style>
:root{font-family:-apple-system,BlinkMacSystemFont,'Yu Gothic',sans-serif;color:#20352b;background:#f4f7f5;line-height:1.7}body{margin:0 auto;max-width:1020px;padding:24px 20px 70px}h1{font-size:clamp(24px,5vw,34px);line-height:1.4}h2{font-size:22px;margin-top:34px}p{max-width:78ch}a{color:#14724e}section,.status,details{background:white;border:1px solid #d7e3dc;border-radius:16px;padding:20px;margin:18px 0}.status{border-left:7px solid #198257}.status strong{font-size:23px}table{border-collapse:collapse;width:100%;font-size:15px}th,td{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid #e1e8e4}th{width:22%}.scroll{overflow-x:auto}small{color:#53665b}.ok{color:#215943}.ng{color:#a12727}summary{cursor:pointer;font-weight:700}li{margin:.45em 0}code{overflow-wrap:anywhere;font-size:13px}nav{display:flex;flex-wrap:wrap;gap:10px}nav a{padding:7px 12px;background:white;border:1px solid #d7e3dc;border-radius:10px;text-decoration:none}@media(max-width:600px){body{padding:18px 12px 50px}section,.status,details{padding:15px}th,td{padding:9px;font-size:14px}th{width:25%}table,tbody,tr,th,td{display:block}thead{display:none}tr{border-bottom:1px solid #e1e8e4;padding:9px 0}th,td{width:auto;border:0;padding:4px 0}th{font-size:16px}td{font-size:14px;overflow-wrap:anywhere}}
</style><nav><a href="index.html">監査全体</a><a href="data-audit-results.json">主課題の実行結果</a><a href="training-provenance-results.json">説明・練習の実行結果</a><a href="static-contract.json">補助のソース照合</a></nav><h1>裏で記録するデータは引き継がれているか</h1>
<p>旧チュートリアル ui19 の凍結版と現行版を別々の保存領域で動かし、同じ合成操作で比較しました。ソースが同じという確認と、実際の操作で記録を確認した結果を分けています。</p>
<div class="status"><strong>${passed?'実行した範囲で、意図しない記録の欠落は見つかりませんでした。':'検査結果に要確認項目があります。'}</strong><p>主課題 ${count(raw)}項目、説明・練習 ${count(training)}項目。合成データだけを使い、実参加者・GAS・Driveへはアクセスしていません。</p><small>Chromiumのタッチエミュレーションによる確認です。iPhone Safariの実機動作を確認済みとする結果ではありません。</small></div>
<section><h2>実際に操作して照合した範囲</h2><div class="scroll"><table><thead><tr><th>項目</th><th>確認方法</th><th>確認した記録</th></tr></thead><tbody>
${row('生の指の移動','新旧で同じ実タッチ。ブラウザのcapture listenerが観測したイベントとpayloadを一対一で比較。','seq・type・x・y・event.timeStamp・timeOrigin・surface座標・nDispatched/nCoalesced。軌跡の線が非表示でも生系列は保持。')}
${row('細かいサンプル','実タッチに加え、同じ時刻を持つサブフレーム2点を含む合成coalescedイベントを実際の記録リスナーへ送信。','36点を保持。重複時刻を間引かず、座標を2桁で保持。時刻原点を正規化した新旧系列も一致。')}
${row('3秒と停止','押下後3150ms待つ例と、早く枠を出てから3050ms待つ例を別に操作。','initiationTは4pxの遊びを含む枠の外へ出た最初のdispatched。後から回答が3秒を超えたことをlateStartにしない。RT/MT/totalと停止集計も照合。')}
${row('無効操作','枠外で離す・記録点不足・pointercancel・ドラッグ途中の再読込。','invalidAttempts・invalidReason・attemptNumber・trialOrdinal・aborts。途中再開で点やup/終了時刻を作り足さない。')}
${row('保存・再開','実際のIndexedDB保存→ページ再読込→再開。旧版で評定途中まで進み、現行コードに切替えて再開。','rawと既存値、セッションID、開始時の版、刺激定義、未確定評定を保持。ratingResumes等の実際の再開来歴を追加。')}
${row('通常の評定','迷いの変更、自信から戻る、説明見直し1100ms、確定を操作。','value・項目別rt_ms・ratingBacks・ratingSubmitMs。任意説明の見直し時間を評定時間に加えずtutorialLogへ記録。')}
${row('質問定義','事後アンケート18画面を同じ合成回答で順に進む。','実表示順、26項目のpostPresentedKeys、postQuestionMeta、collectionPlan、surveyProblemDefinitionが新旧一致。')}
${row('説明と練習','新旧の初回説明を進み、純操作、現行のクイズ、例題、評定説明、5問練習を操作。','説明表示・滞在、純操作の成功失敗、クイズの回答と再開、例題と練習のphase分離、確定後の説明時間を評定時間に加えないこと。')}
</tbody></table></div></section>
<section><h2>同じではないが、欠落とは区別する変更</h2><ul><li>現行では説明を細かく分けたため、説明のstep IDと表示履歴が増えています。旧版の完了を新しい7問のクイズ完了として補完しません。</li><li>評定説明は3ページから4ページになり、その後に練習の導入が続きます。自信を確定した時点の <code>ratingSubmitMs</code> を保持し、その後の説明時間を加えません。</li><li>現行では評定説明中に自信から迷いへ戻る操作も <code>ratingBacks</code> に加算します。説明の再表示では選択値を保持します。</li><li>中断から戻ったときは、前の記録を保存したまま、実際の再開回数・時刻等の来歴が増えます。</li></ul></section>
<section><h2>記録されている粒度の限界</h2><ul><li>純粋な「指を運ぶ」練習は、旧版も現行も分析用の <code>trials</code> に密な座標系列を作りません。現行では <code>motor_complete</code> 等の成功・失敗の来歴と状態を保持します。例題・5問練習・本番の生系列とは別です。</li><li>評定説明は、旧版も現行も <code>tutorialLog</code> の <code>kind:rating/page/ms</code> でページ滞在を記録します。評定説明の各ページに <code>instructionExposure</code> がある方式ではありません。</li><li>現行クイズは各回答の正誤・選択・順序・試行回数を記録します。<code>instructionExposure</code> はクイズ全体に入った時の履歴、滞在時間も全体の区間です。2〜7問の各問に独立した表示時刻・滞在時間があるという意味ではありません。</li><li><code>instructionExposure</code> や滞在時間は、実際に理解したことの証明には使えません。iOSが公開しなかった指のサンプルを復元する検査でもありません。</li></ul></section>
<h2>検査項目の詳細</h2>${checks('主課題・保存・質問定義',raw,'data-audit-results.json')}${checks('説明・例題・練習の来歴',training,'training-provenance-results.json')}
<details><summary>補助資料：ファイルの同一性（動作テストとは別）</summary><div class="scroll"><table><thead><tr><th>配布資産</th><th>新旧差分</th><th>判定の意味</th></tr></thead><tbody>${staticRows}</tbody></table></div><p><a href="test-static-contract.cjs">ソース照合スクリプト</a> ／ <a href="test-data-audit.cjs">主課題の実行スクリプト</a> ／ <a href="test-training-provenance.cjs">説明・練習の実行スクリプト</a></p></details><p><small>各結果JSONには実行時のソースSHAを保存しています。公開先の一致検査や実機確認とは分けて扱います。</small></p></html>`;
fs.writeFileSync(path.join(dir,'data-audit.html'),doc);
console.log(JSON.stringify({passed,main:count(raw),training:count(training)}));
