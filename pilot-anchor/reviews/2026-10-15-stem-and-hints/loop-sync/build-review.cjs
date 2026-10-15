'use strict';
const fs=require('fs'),path=require('path');
const file=path.join(__dirname,'../index.html');
const section=`<section id="loop-sync"><h2>追加調整：文字が消えてからスタートへ戻す</h2><p>「触れる」「枠の外へ出る」が見えている間は、ボタン内の矢印と緑色を保ちます。2つの文字が消えると同時に「スタート」と通常色へ戻り、0.3秒待って次の接触を始めます。</p><p><a href="../../index.html?go=tut&amp;gstep=time-rule&amp;block=moral&amp;debug=1&amp;upload=0&amp;mic=0&amp;revision=loop-sync1">最新の実演を開く（送信なし）</a> · <a href="loop-sync-results.json">追加65項目の検証</a> · <a href="loop-sync/full-validation-results.json">今回の全体検証</a></p><div class="pair"><figure><figcaption>文字が消える前：矢印と緑色を保つ</figcaption><img src="shots/loop-sync/375x548/after-reset.png" width="375" height="548" alt="リプレイ直前まで矢印と緑の文字を表示"></figure><figure><figcaption>文字が消える時：「スタート」へ戻す</figcaption><img src="shots/loop-sync/375x548/after-idle.png" width="375" height="548" alt="次のループで両ラベルが消えてスタートへ戻る"></figure></div><p class="note">以下は、先に実施した表示調整の比較記録です。</p></section>`;
let html=fs.readFileSync(file,'utf8');
if(html.includes('<section id="loop-sync">'))html=html.replace(/<section id="loop-sync">[\s\S]*?<\/section>/,section);
else{const anchor='<h1>問題文・操作の注意・説明と見本</h1>';if(html.split(anchor).length!==2)throw Error('Review title not found');html=html.replace(anchor,anchor+section);}
const temp=file+'.loop-tmp';fs.writeFileSync(temp,html);fs.renameSync(temp,file);
