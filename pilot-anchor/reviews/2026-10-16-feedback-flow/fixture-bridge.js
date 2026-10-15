  // BEGIN REVIEW-ONLY FIXTURE. Inserted solely into app/preview-runtime.js.
  // Normal index.html and every production asset stay byte-for-byte frozen.
  (() => {
    const candidate=QS.get('variant')==='candidate';
    const scenarios={
      'practice-late':{practice:true,number:2,keys:['late']},
      'practice-multiple':{practice:true,number:2,keys:['early','late','release']},
      'practice-last':{practice:true,number:5,keys:['early','late','release']},
      'practice-clear':{practice:true,number:2,keys:[]},
      'main-early':{number:8,keys:['early']},'main-late':{number:8,keys:['late']},
      'main-both':{number:8,keys:['early','late']},'main-clear':{number:8,keys:[]},
      'break-both':{number:20,keys:['early','late']},'break-clear':{number:20,keys:[]},
      'break-capped':{number:20,keys:['early','late'],noticeHistory:5},
    };
    const scenarioId=Object.hasOwn(scenarios,QS.get('case'))?QS.get('case'):'practice-multiple',fixture=scenarios[scenarioId];
    let ready=false,afterBreak=false;const history=[];
    const ui=candidate?window.createFeedbackCandidate({document,config:window.PILOT_GUIDED_TUTORIAL,lastPractice:()=>phase==='practice'&&queue.length===0,context:()=>({afterBreak,noticeKind:pendingNotice})}):null;
    const originals={showPracticeCheck,showStopNotice,showBreak};
    if(candidate){
      document.body.classList.add('feedback-candidate');
      showPracticeCheck=function(state){originals.showPracticeCheck(state);ui.practice(state);};
      showStopNotice=function(kind){originals.showStopNotice(kind);ui.notice(kind);afterBreak=false;};
      showBreak=function(){originals.showBreak();const will=noticeKinds(pendingNotice).some(k=>device.stopNotices.filter(n=>noticeKinds(n.kind).includes(k)).length<NOTICE_MAX[k]);afterBreak=will;ui.break(will);};
    }
    const itemId=c=>c&&(c.itemId||c.id)||null;
    const snapshot=()=>({ready,variant:candidate?'candidate':'current',scenario:scenarioId,screen:document.querySelector('.screen.active')?.id,phase,resumeStage,ratPage,trialIndex,totalMain,queueLength:queue.length,nextItem:itemId(queue[0]),cellItem:itemId(cell),records:records.length,practiceCount:records.filter(r=>r.phase==='practice').length,mainCount:records.filter(r=>r.phase==='main').length,trialRatings:trial?JSON.parse(JSON.stringify(trial.ratings)):null,practiceKeys:practiceCheckState?.keys.slice()||[],checked:practiceCheckState?.checked.slice()||[],practiceChecks:device.practiceChecks.slice(),notices:device.stopNotices.slice(),noticeAcknowledgements:device.noticeAcknowledgements.slice(),noticeSuppressed:device.stopNoticesSuppressed,breaks:device.breaks.slice(),pendingNotice,noticeKind,stemShownT,stimulusOnsetT:trial?.stimulusOnsetT||null,mainStartedAt,pendingMainStart,uiLocked,sourceVersion:INSTRUCTION_VERSION,uploadUrl:CONFIG.uploadUrl,persistentStorage:false,networkAttempts:window.__feedbackIsolation.attempts.slice(),candidatePage:ui?.page()??null});
    const makeRecord=(c,n)=>({phase:fixture.practice?'practice':'main',block:'moral',previewOnly:true,index:n,stimulusType:BLOCK.stimulusType,...BLOCK.trialMeta(c),choiceSide:'left',ratings:{hesitation:{value:3,rt_ms:400},confidence:{value:3,rt_ms:400}},events:[],aborts:0,earlyStart:false,lateStart:false,preStartMs:5000,rt_ms:400});
    function start(at='rating'){
      if(CONFIG.uploadUrl!==null||!GO)throw Error('No-send preview invariant failed');
      ui?.reset();afterBreak=false;hideBanner();clearIdleCoach();coachHide();setCoach(null);
      if(dragTutState.active)DragTut.abort();if(ratingReview)closeRatingReview();
      dragTutState.done=true;ratingTutorialDone=true;tutIdx=-1;tutRender();
      recording=false;activePointerId=null;uiLocked=true;streak=fixture.number;
      records.length=0;invalidAttempts.length=0;pendingNotice=null;stopNoticeShown=false;pendingMainStart=false;pendingInstructedStart=false;practiceCheckState=null;practiceRuleFlags=[];
      for(const key of ['practiceChecks','stopNotices','noticeAcknowledgements','breaks'])device[key]=[];
      device.stopNoticesSuppressed=0;if(fixture.noticeHistory)for(let n=0;n<fixture.noticeHistory;n++)device.stopNotices.push({kind:'early_late',afterTrial:n+1,ms:800,previewOnly:true});
      phase=fixture.practice?'practice':'main';seqIndex=0;mainStartedAt=fixture.practice?null:performance.now();mainElapsedAtEnd=null;
      let cells=fixture.practice?BLOCK.buildPractice(CONFIG.practiceTrials):BLOCK.buildMain();
      if(!fixture.practice&&ATTN_ON&&BLOCK.ratings&&BLOCK.id!=='attn'){cells=insertDqs(cells);cells=cells.concat(shuffle([makeCheckCell('infreq'),makeCheckCell('imc')]));}
      totalMain=fixture.practice?0:cells.length;trialIndex=fixture.practice?0:fixture.number-1;cell=cells[fixture.number-1];queue=cells.slice(fixture.number);
      for(let n=1;n<fixture.number;n++)records.push(makeRecord(cells[n-1],n));
      trial=makeRecord(cell,fixture.number);trial.earlyStart=fixture.keys.includes('early');trial.lateStart=fixture.keys.includes('late');trial.preStartMs=trial.earlyStart?80:5000;trial.rt_ms=trial.lateStart?3400:400;
      records.push(trial);practiceRuleFlags=fixture.keys.includes('release')?['release']:[];
      pendingNotice=trial.earlyStart&&trial.lateStart?'early_late':trial.earlyStart?'early':trial.lateStart?'late':null;
      sizeCanvas();$('counter').textContent=counterText();updateProgress();beginRating();
      history.length=0;history.push({screen:'rating',at:performance.now(),fixture:true});
      if(at==='feedback'){trial.ratings={hesitation:{value:3,rt_ms:400},confidence:{value:3,rt_ms:400}};ratShowPage(1);submitRating();}
      ready=true;
      const badge=$('goBadge');if(badge)badge.textContent='仮画面・送信なし · '+(candidate?'変更案':'現行');
      document.body.dataset.previewReady='true';document.body.dataset.previewVariant=candidate?'candidate':'current';
      return snapshot();
    }
    const observer=new MutationObserver(()=>{if(!ready)return;const screen=document.querySelector('.screen.active')?.id;if(screen&&history.at(-1)?.screen!==screen)history.push({screen,at:performance.now(),fixture:false});ui?.onScreen(screen);});
    observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
    window.FeedbackPreview=Object.freeze({start,snapshot,history:()=>history.map(x=>({...x})),scenario:()=>({...fixture,id:scenarioId,keys:fixture.keys.slice()})});
    requestAnimationFrame(()=>start(QS.get('start')==='feedback'?'feedback':'rating'));
  })();
  // END REVIEW-ONLY FIXTURE.
