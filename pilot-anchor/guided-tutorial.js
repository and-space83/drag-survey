'use strict';
// 採用済みチュートリアルの文言・手順・復習問題・保存schemaの定義。
// 表示はjs/tutorial-view.jsとtutorial-visuals.js、進行・保存接続はtutorial-controller.js。
window.PILOT_GUIDED_TUTORIAL={
  "schema": "guided-2026-10-15",
  "steps": [
    {
      "id": "layout-intro",
      "chapter": "1 画面の見方",
      "kind": "instruction",
      "focus": null,
      "title": "画面の見方",
      "copy": "まず、画面の見方を説明します。",
      "button": "次へ",
      "action": "読んだら「次へ」"
    },
    {
      "id": "layout-stem",
      "chapter": "1 画面の見方",
      "kind": "orientation",
      "focus": "stem",
      "title": "問題文",
      "copy": "ここに表示される問題文を読みます。",
      "button": "次へ",
      "action": "見るだけです。読んだら「次へ」"
    },
    {
      "id": "layout-start",
      "chapter": "1 画面の見方",
      "kind": "orientation",
      "focus": "start",
      "title": "スタートボタン",
      "copy": "このスタートボタンに指を置くと、選択肢が現れます。",
      "button": "次へ",
      "action": "見るだけです。読んだら「次へ」"
    },
    {
      "id": "layout-choice",
      "chapter": "1 画面の見方",
      "kind": "orientation",
      "focus": "choices",
      "title": "選択肢",
      "copy": "ここに2つの選択肢が出ます。選ぶほうへ指を運んで答えます。",
      "button": "操作の方法へ",
      "action": "見るだけです。読んだら「操作の方法へ」"
    },
    {
      "id": "motor-route",
      "chapter": "2 操作の方法",
      "kind": "demo",
      "focus": null,
      "title": "指を離さずに運ぶ",
      "copy": "スタートに指を置いたらそのまま離さずに運び、選択肢のボックスの中で離します。",
      "extraCopy": "道すじは自由です",
      "button": "次へ",
      "action": "見るだけです。読んだら「次へ」"
    },
    {
      "id": "motor-range",
      "chapter": "2 操作の方法",
      "kind": "demo",
      "focus": null,
      "title": "選択肢の枠内で離す",
      "copy": "スタートから指を運び、選択肢のボックスの内側で離すと回答できます。\n枠内ならどこでも大丈夫です。",
      "button": "試してみる",
      "action": "見るだけです。読んだら「試してみる」へ"
    },
    {
      "id": "motor",
      "chapter": "2 操作の方法",
      "kind": "motor",
      "focus": null,
      "title": "実際に運んでみる",
      "copy": "スタートに指を置いて指を離さずに運び、選択肢のボックスの中で離してみましょう。",
      "button": "次へ",
      "action": "下のスタートから運んでみてください"
    },
    {
      "id": "start-rule",
      "chapter": "3 ルールを確認する",
      "kind": "instruction",
      "focus": null,
      "title": "スタートに指を置くタイミング",
      "copy": "問題文を最後まで読み、状況が分かったら、答えを決める前にスタートボタンに指を置きます。",
      "button": "次へ"
    },
    {
      "id": "movement-reason",
      "chapter": "3 ルールを確認する",
      "kind": "instruction",
      "focus": null,
      "title": "選択肢を読んだら動き始める",
      "copy": "答えが決まるのを待たずに、指を動かし始めてください。\n答えを選んでいる間の動きを計測するためです。",
      "button": "次へ"
    },
    {
      "id": "uncertain",
      "chapter": "3 ルールを確認する",
      "kind": "instruction",
      "focus": null,
      "title": "迷っていても動かしながら考える",
      "copy": "どちらを選ぶか迷っているときも、ゆっくりでよいので指を動かしながら考えてください。",
      "button": "次へ"
    },
    {
      "id": "time-rule",
      "chapter": "3 ルールを確認する",
      "kind": "instruction",
      "focus": null,
      "title": "3秒以内にスタートを出る",
      "copy": "選択肢を読んだら動き始め、スタートに触れてから3秒以内に枠の外へ動かします。",
      "button": "次へ"
    },
    {
      "id": "answer-pace",
      "chapter": "3 ルールを確認する",
      "kind": "instruction",
      "focus": null,
      "title": "自分のペースで回答する",
      "copy": "3秒は回答の制限時間ではありません。\n枠を出たら、自分のペースで焦らず選んでください。ゆっくりでも大丈夫です。",
      "button": "ルールを復習する",
      "action": "読んだら「ルールを復習する」へ"
    },
    {
      "id": "rule-check-intro",
      "chapter": "3 ルールを確認する",
      "kind": "instruction",
      "focus": null,
      "title": "ルールの復習",
      "copy": "ここまでのルールを、クイズ形式で確認します。\n正解するまで選びなおしてください。",
      "button": "復習を始める",
      "action": "読んだら「復習を始める」へ"
    },
    {
      "id": "rule-check",
      "chapter": "3 ルールを確認する",
      "kind": "quiz",
      "focus": null,
      "title": "ルールの復習",
      "copy": "1つずつ、答えを選んでください。",
      "button": "次へ",
      "action": "答えを1つ選んで「次へ」"
    }
  ],
  "checks": [
    {
      "id": "start-trigger",
      "title": "いつスタートする？",
      "copy": "いつスタートに指を置きますか？",
      "labels": [
        "問題文を最後まで読み、状況が分かったら、答えを決める前に",
        "問題文を読み始めたらすぐに",
        "自分の答えを決め終えてから"
      ],
      "correctIndex": 0,
      "right": "状況が分かったら、答えを決める前にスタートへ。",
      "wrong": "最後まで読み、状況が分かったら始めます。\n答えを決め終えるまで待ちません。",
      "ruleRefs": [
        "start-rule"
      ]
    },
    {
      "id": "move-decision",
      "title": "動き始めるとき",
      "copy": "選択肢を読んだあと、いつ動き始めますか？",
      "labels": [
        "選択肢を読んだら、答えが決まるのを待たずに動く",
        "選択肢を読んで、答えを決め終えてから動く",
        "選択肢を読み、3秒がたったら動く"
      ],
      "correctIndex": 0,
      "right": "選択肢を読んだら、答えが決まるのを待たずに動き始めます。",
      "wrong": "答えが決まるのを待たずに動き始めてください。\n答えを選んでいる間の動きを計測するためです。",
      "ruleRefs": [
        "movement-reason"
      ]
    },
    {
      "id": "uncertain",
      "title": "まだ迷っているとき",
      "copy": "まだ迷っているときは、どう進めますか？",
      "labels": [
        "ゆっくりでよいので、指を動かしながら考える",
        "答えが決まるまで、スタートの中で待つ",
        "迷っていても、急いで答えを決める"
      ],
      "correctIndex": 0,
      "right": "どちらを選ぶか迷っているときも、ゆっくりでよいので指を動かしながら考えます。",
      "wrong": "迷っていても、急いで答えを決める必要はありません。ゆっくりでよいので、動かしながら考えてください。",
      "ruleRefs": [
        "uncertain"
      ]
    },
    {
      "id": "exit-time",
      "title": "3秒以内にすること",
      "copy": "スタートに触れてから3秒以内にするのは？",
      "labels": [
        "指をスタートの枠の外へ動かす",
        "選択肢のボックスに到着する",
        "選択肢で指を離して回答を終える"
      ],
      "correctIndex": 0,
      "right": "3秒は、スタートに触れてからスタートの枠の外へ出るまでの制限時間です。",
      "wrong": "3秒以内にするのは、指をスタートの枠の外へ動かすことです。\n回答を終える制限時間ではありません。",
      "ruleRefs": [
        "time-rule"
      ]
    },
    {
      "id": "answer-pace",
      "title": "回答するときのペース",
      "copy": "スタートの枠を出たあとは、どのペースで回答しますか？",
      "labels": [
        "自分のペースで、焦らずに選ぶ",
        "スタートに触れてから3秒以内に終える",
        "枠を出てから3秒以内に終える"
      ],
      "correctIndex": 0,
      "right": "回答は、自分のペースで焦らず選んでください。ゆっくりでも大丈夫です。",
      "wrong": "3秒は回答の制限時間ではありません。\n枠を出たら、自分のペースで焦らず選んでください。ゆっくりでも大丈夫です。",
      "ruleRefs": [
        "answer-pace"
      ]
    },
    {
      "id": "path",
      "title": "道すじの選び方",
      "copy": "指を運ぶ道すじは、どうしますか？",
      "labels": [
        "自由な道すじで運ぶ",
        "見本と同じ道すじで運ぶ",
        "必ずまっすぐに運ぶ"
      ],
      "correctIndex": 0,
      "right": "道すじは自由です。\n毎回同じ道すじを意識せず、自然に指を動かしてください。",
      "wrong": "道すじは自由です。まっすぐでも回り道でもかまいません。\n見本や毎回同じ道すじを意識せず、自然に指を動かしてください。",
      "ruleRefs": [
        "motor-route"
      ]
    },
    {
      "id": "release",
      "title": "指を離して回答する",
      "copy": "選択肢へ運んだあと、どうすると回答できますか？",
      "labels": [
        "枠の内側なら、どこで離してもよい",
        "文字の上で離したときだけ回答できる",
        "枠に入れば、指を離さなくても回答できる"
      ],
      "correctIndex": 0,
      "right": "枠の内側ならどこでも、指を離すと回答できます。",
      "wrong": "枠の内側に入るだけでは、まだ回答は決まりません。\n枠の内側ならどこでも、指を離すと回答できます。",
      "ruleRefs": [
        "motor-range",
        "motor"
      ]
    }
  ],
  "legacyStepIds": [
    "layout-intro",
    "layout-stem",
    "layout-stem",
    "layout-start",
    "layout-choice",
    "motor-route",
    "motor",
    "start-rule"
  ]
};
