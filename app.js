
const STORAGE_KEY = "cholscore_v02";
const LEGACY_KEY = "cholscore_v01";
const todayKey = () => new Date().toISOString().slice(0,10);

const defaultState = {
  profile: null,
  days: {},
  routines: [],
  activeWorkout: null,
  achievements: { firstFood:false, firstMove:false, onTarget:false, score80:false }
};

let state = loadState();
let selectedTarget = 30;
let selectedDistanceUnit = "mi";
let selectedFeeling = 3;
let finishFeeling = 3;
let calendarDate = new Date();
let workoutTimer = null;
let timedSetTimer = null;
let timedCountdownTimer = null;
let barcodeScanner = null;
let currentProduct = null;
let scannerPurpose = "add";
let checkedProduct = null;
let editingRoutineId = null;
let activeRewardCategory = "all";
let currentFoodDetailId = null;
let currentFoodDetailRef = null;

function cloneDefault(){ return JSON.parse(JSON.stringify(defaultState)); }
function loadState(){
  try {
    const fresh = localStorage.getItem(STORAGE_KEY);
    if(fresh) return normaliseState(JSON.parse(fresh));
    const legacy = localStorage.getItem(LEGACY_KEY);
    if(legacy){
      const migrated = normaliseState(JSON.parse(legacy));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch(e){}
  return cloneDefault();
}
function normaliseState(s){
  const d=cloneDefault();

  // Upgrade legacy food records created before food IDs were introduced.
  if(s?.days){
    for(const day of Object.values(s.days)){
      if(Array.isArray(day?.foods)){
        day.foods=day.foods.map(food=>({
          ...food,
          id: food.id || id()
        }));
      }
    }
  }
  const profile=s?.profile ? {...s.profile, distanceUnit:(s.profile.distanceUnit==="km"?"km":"mi")} : null;
  return {
    ...d,...s,
    profile,
    routines:Array.isArray(s?.routines)?s.routines:[],
    activeWorkout:s?.activeWorkout||null,
    achievements:{...d.achievements,...(s?.achievements||{})}
  };
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function ensureDay(key=todayKey()){
  if(!state.days[key]) state.days[key] = { foods:[], activities:[], checkedOut:false, finalScore:null };
  return state.days[key];
}
function getDay(key=todayKey()){
  return state.days[key] || {foods:[],activities:[],checkedOut:false,finalScore:null};
}
const $ = id=>document.getElementById(id);
const qsa = (sel,root=document)=>[...root.querySelectorAll(sel)];
function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}

function distanceUnit(){
  return state.profile?.distanceUnit==="km" ? "km" : "mi";
}
function unitLong(){
  return distanceUnit()==="km" ? "kilometres" : "miles";
}
function kmToDisplay(km){
  const n=Number(km||0);
  return distanceUnit()==="km" ? n : n*0.621371;
}
function displayToKm(value){
  const n=Number(value||0);
  return distanceUnit()==="km" ? n : n/0.621371;
}
function distanceText(km){
  return `${fmt(kmToDisplay(km))} ${distanceUnit()}`;
}
function achievementDistanceValue(km){
  return kmToDisplay(km);
}

function fmt(n){return Number(n||0).toFixed(1);}
function feelEmoji(n){return ["","😣","😕","😐","🙂","😄"][Number(n)||3];}
function id(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function greeting(){const h=new Date().getHours();return h<12?"Good morning":h<18?"Good afternoon":"Good evening";}
function minutesBetween(start,finish){
  const [sh,sm]=start.split(":").map(Number),[fh,fm]=finish.split(":").map(Number);
  let mins=(fh*60+fm)-(sh*60+sm); if(mins<0) mins+=1440; return mins;
}
function elapsedMinutes(startedAt,endedAt=Date.now()){
  return Math.max(0,Math.round((endedAt-new Date(startedAt).getTime())/60000));
}
function formatExerciseSeconds(total){
  const sec=Math.max(0,Math.round(Number(total||0)));
  const m=Math.floor(sec/60),s=sec%60;
  return m?`${m}:${String(s).padStart(2,"0")}`:`${s}s`;
}
function clearTimedSetTimers(){
  clearInterval(timedSetTimer);timedSetTimer=null;
  clearInterval(timedCountdownTimer);timedCountdownTimer=null;
}
function elapsedClock(startedAt){
  const sec=Math.max(0,Math.floor((Date.now()-new Date(startedAt).getTime())/1000));
  const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;
  return h?`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
function totals(day=getDay()){
  const sat=day.foods.reduce((a,b)=>a+Number(b.sat||0),0);
  const mins=day.activities.reduce((a,b)=>a+Number(b.minutes||0),0);
  return {sat,mins,activities:day.activities.length};
}
function scoreDay(day=getDay()){
  if(!state.profile) return 0;
  const {sat,mins,activities}=totals(day), target=Number(state.profile.target||30), ratio=sat/target;
  let foodScore=0;
  if(day.foods.length===0) foodScore=0;
  else if(ratio<=.75) foodScore=50;
  else if(ratio<=1) foodScore=50-((ratio-.75)/.25)*10;
  else if(ratio<=1.25) foodScore=40-((ratio-1)/.25)*20;
  else foodScore=Math.max(0,20-((ratio-1.25)/.75)*20);
  const moveBase=Math.min(25,mins/45*25);
  const participation=activities?10:0;
  const consistency=(day.foods.length?5:0)+(activities?5:0);
  return Math.max(0,Math.min(100,Math.round(foodScore+moveBase+participation+consistency)));
}
function scoreLabel(s){return s>=90?"Outstanding":s>=80?"Flying":s>=70?"Great day":s>=55?"Building momentum":s>=35?"Good start":"Getting started";}

function init(){
  if(!state.profile){
    $("onboarding").classList.remove("hidden");$("mainApp").classList.add("hidden");
  }else{
    $("onboarding").classList.add("hidden");$("mainApp").classList.remove("hidden");
    ensureDay(); renderAll();
    if(state.activeWorkout) showActiveWorkoutBanner();
  }
}

function mondayKeyFor(dateLike=new Date()){
  const d=new Date(dateLike);
  d.setHours(0,0,0,0);
  const day=(d.getDay()+6)%7;
  d.setDate(d.getDate()-day);
  return d.toISOString().slice(0,10);
}

function weeklyBankPoints(){
  const monday=mondayKeyFor(new Date());
  let total=0;
  for(const [key,day] of Object.entries(state.days)){
    if(key < monday) continue;
    if(!day.checkedOut) continue;
    const t=totals(day);
    const target=Number(state.profile?.target||30);
    if(!day.foods.length || t.sat>=target) continue;

    // Reward consistency, but cap each day so "eating as little as possible"
    // never becomes the game.
    const remaining=Math.max(0,target-t.sat);
    const daily=Math.min(5,Math.round((remaining/target)*10));
    total += daily;
  }
  return total;
}

function bankResetLabel(){
  const now=new Date();
  const next=new Date(now);
  const days=(8-now.getDay())%7 || 7;
  next.setDate(now.getDate()+days);
  next.setHours(0,0,0,0);
  const diff=Math.max(1,Math.ceil((next-now)/86400000));
  return diff===1?"Resets tomorrow morning":`Resets Monday · ${diff} days`;
}

function renderAll(){renderToday();renderFood();renderExercise();renderRewards();renderCalendar();}

function renderToday(){
  const day=getDay(),t=totals(day),score=scoreDay(day),target=Number(state.profile.target);
  $("greeting").textContent=`${greeting()}, ${state.profile.name}`;
  $("heroMessage").textContent=score>=80?"You're absolutely flying today.":score>=55?"Nice work — keep the momentum going.":"Every positive choice moves you forward.";
  $("satUsed").textContent=`${fmt(t.sat)}g`;$("satRemaining").textContent=`${fmt(Math.max(0,target-t.sat))}g`;
  $("moveMinutes").textContent=Math.round(t.mins);$("activityCount").textContent=t.activities;
  $("dailyScore").textContent=score;$("scoreLabel").textContent=scoreLabel(score);
  $("satRing").style.setProperty("--pct",Math.min(100,t.sat/target*100));
  $("moveRing").style.setProperty("--pct",Math.min(100,t.mins/45*100));
  $("scoreRing").style.setProperty("--pct",score);

  const items=[...day.foods.map(x=>({...x,kind:"food"})),...day.activities.map(x=>({...x,kind:"activity"}))]
    .sort((a,b)=>(b.created||0)-(a.created||0));
  $("timelineCount").textContent=`${items.length} ${items.length===1?"item":"items"}`;
  $("timeline").classList.toggle("empty-state",!items.length);
  $("timeline").innerHTML=items.length?items.map(x=>x.kind==="food"
    ?`<div class="log-item food-log-item" data-food-id="${x.id||""}">
        <div class="food-log-main">
          ${x.image?`<img class="food-thumb" src="${esc(x.image)}" alt="${esc(x.name)}" loading="lazy">`:`<div class="food-thumb food-thumb-fallback">🍎</div>`}
          <div><strong>${esc(x.name)}</strong><small>${esc(x.meal)}${x.brand?` · ${esc(x.brand)}`:""}</small></div>
        </div>
        <div class="log-value">${fmt(x.sat)}g<br><small>sat fat</small></div>
      </div>`
    :`<div class="log-item"><div><strong>${x.type==="run"?"🏃":x.type==="walk"?"🚶":x.type==="workout"?"🏋️":"⚡"} ${esc(x.name)}</strong><small>${x.minutes} min${x.distance?` · ${distanceText(x.distance)}`:""}${x.type==="workout"&&x.exerciseCount?` · ${x.exerciseCount} exercises`:""}</small></div><div class="log-value">${feelEmoji(x.feel)}</div></div>`
  ).join(""):"Nothing logged yet. Your first win starts here.";
  wireFoodCards();
  if($("bankPoints")) $("bankPoints").textContent=weeklyBankPoints();
  if($("bankResetText")) $("bankResetText").textContent=bankResetLabel();
}

function wireFoodCards(){
  qsa("[data-food-id]").forEach(card=>{
    card.addEventListener("click",()=>{
      const fid=card.dataset.foodId;
      const day=getDay();
      const food=day.foods.find(x=>String(x.id||"")===String(fid));
      if(food) showFoodDetail(food);
    });
  });
}

function showFoodDetail(food){
  if(!food.id) food.id=id();
  currentFoodDetailId=food.id;
  currentFoodDetailRef=food;
  saveState();
  $("detailFoodName").textContent=food.name||"Food";
  $("detailFoodBrand").textContent=food.brand||"";
  $("detailFoodBarcode").textContent=food.barcode?`Barcode ${food.barcode}`:"";

  const img=$("detailFoodImage"),fallback=$("detailFoodFallback");
  if(food.image){
    img.src=food.image;img.alt=food.name||"Food";img.classList.remove("hidden");fallback.classList.add("hidden");
  }else{
    img.removeAttribute("src");img.classList.add("hidden");fallback.classList.remove("hidden");
  }

  $("detailFoodMeal").textContent=food.meal||"Not recorded";
  $("detailFoodSat").textContent=`${fmt(food.sat)}g`;
  $("detailFoodProtein").textContent=food.protein!=null?`${fmt(food.protein)}g`:"Not recorded";

  let amountText="Not recorded";
  if(food.amount!=null){
    if(food.amountUnit==="serving") amountText=`${food.amount} serving${Number(food.amount)===1?"":"s"}`;
    else amountText=`${food.amount}g`;
  }
  $("detailFoodAmount").textContent=amountText;
  $("detailFoodSource").textContent=food.source||"Manual";
  $("foodDetailDialog").showModal();
}

function renderFood(){
  const day=getDay(),t=totals(day),target=Number(state.profile.target);
  $("foodTotal").textContent=fmt(t.sat);$("foodTarget").textContent=fmt(target);$("foodBar").style.width=`${Math.min(100,t.sat/target*100)}%`;
  $("foodList").innerHTML=day.foods.length?day.foods.slice().reverse().map(x=>`
    <div class="log-item food-log-item" data-food-id="${x.id||""}">
      <div class="food-log-main">
        ${x.image?`<img class="food-thumb food-thumb-large" src="${esc(x.image)}" alt="${esc(x.name)}" loading="lazy">`:`<div class="food-thumb food-thumb-large food-thumb-fallback">🍎</div>`}
        <div>
          <strong>${esc(x.name)}</strong>
          <small>${esc(x.meal)}${x.brand?` · ${esc(x.brand)}`:""}</small>
        </div>
      </div>
      <div class="log-value">${fmt(x.sat)}g</div>
    </div>`).join(""):`<div class="empty-state">No food logged today.</div>`;
  wireFoodCards();
}

function renderProteinToday(day=getDay()){
  const foods=day.foods.filter(f=>Number(f.protein||0)>0);
  const total=foods.reduce((sum,f)=>sum+Number(f.protein||0),0);

  if($("proteinTodayTotal")) $("proteinTodayTotal").textContent=fmt(total);
  if($("proteinFoodCount")) $("proteinFoodCount").textContent=`From ${foods.length} logged ${foods.length===1?"food":"foods"}`;

  if(!$("proteinBreakdown")) return;
  if(!foods.length){
    $("proteinBreakdown").innerHTML=`<div class="empty-state">Protein from scanned foods will appear here.</div>`;
    return;
  }

  $("proteinBreakdown").innerHTML=foods.slice().reverse().map(f=>`
    <div class="protein-row">
      <div class="protein-row-main">
        ${f.image?`<img class="protein-thumb" src="${esc(f.image)}" alt="${esc(f.name)}" loading="lazy">`:`<div class="protein-thumb protein-thumb-fallback">🥚</div>`}
        <div>
          <strong>${esc(f.name)}</strong>
          <small>${esc(f.meal||"Food")}${f.brand?` · ${esc(f.brand)}`:""}</small>
        </div>
      </div>
      <b>${fmt(f.protein)}g</b>
    </div>
  `).join("");
}

function renderExercise(){
  const day=getDay(),t=totals(day);
  $("exerciseMinutes").textContent=Math.round(t.mins);$("exerciseBar").style.width=`${Math.min(100,t.mins/45*100)}%`;
  if($("distanceUnitLabel")) $("distanceUnitLabel").textContent=distanceUnit();
  renderProteinToday(day);
  renderRoutines();
  showActiveWorkoutBanner();
  $("exerciseList").innerHTML=day.activities.length?day.activities.slice().reverse().map(x=>`<div class="log-item"><div><strong>${x.type==="run"?"🏃":x.type==="walk"?"🚶":x.type==="workout"?"🏋️":"⚡"} ${esc(x.name)}</strong><small>${x.type==="workout"?`${x.exerciseCount||0} exercises · `:""}${x.minutes} min${x.distance?` · ${distanceText(x.distance)}`:""}</small></div><div class="log-value">${feelEmoji(x.feel)}</div></div>`).join(""):`<div class="empty-state">No completed activity today.</div>`;
}
function renderRoutines(){
  $("routineCount").textContent=`${state.routines.length} ${state.routines.length===1?"routine":"routines"}`;
  if(!state.routines.length){
    $("routineList").innerHTML=`<div class="empty-state">Create your regular workout once, then simply start it whenever you're ready.</div>`;
    return;
  }
  $("routineList").innerHTML=state.routines.map(r=>{
    const preview=r.exercises.slice(0,4).map(e=>`<span class="routine-chip">${esc(e.name)} · ${e.sets} ${e.timed?"timed sets":`×${e.reps}`}${Number(e.weight)>0?` · ${fmt(e.weight)}kg`:""}</span>`).join("");
    return `<div class="routine-card" data-edit-routine="${r.id}">
      <div class="routine-card-top"><div><h4>${esc(r.name)}</h4><p>${r.exercises.length} ${r.exercises.length===1?"exercise":"exercises"}</p></div></div>
      <div class="routine-preview">${preview}${r.exercises.length>4?`<span class="routine-chip">+${r.exercises.length-4} more</span>`:""}</div>
      <div class="routine-card-actions">
        <button class="start-routine-btn" data-start-routine="${r.id}">Start workout</button>
        <button class="delete-routine-btn" data-delete-routine="${r.id}" aria-label="Delete routine">•••</button>
      </div>
      <div class="routine-card-edit-hint">✎ Tap the card to edit routine</div>
    </div>`;
  }).join("");

  qsa("[data-edit-routine]").forEach(card=>card.addEventListener("click",e=>{
    if(e.target.closest("[data-start-routine]")||e.target.closest("[data-delete-routine]")) return;
    openRoutineEditor(card.dataset.editRoutine);
  }));
  qsa("[data-start-routine]").forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();startRoutine(b.dataset.startRoutine);}));
  qsa("[data-delete-routine]").forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();deleteRoutine(b.dataset.deleteRoutine);}));
}
function showActiveWorkoutBanner(){
  const b=$("activeWorkoutBanner");
  if(!b) return;
  if(!state.activeWorkout){b.classList.add("hidden");return;}
  b.classList.remove("hidden");
  $("activeWorkoutName").textContent=state.activeWorkout.name;
  $("activeWorkoutElapsed").textContent=`${elapsedMinutes(state.activeWorkout.startedAt)} min elapsed`;
}

const achievementDefs = [
  // Food
  {id:"food_first",cat:"food",icon:"🍎",title:"First Bite",desc:"Log your first food.",rarity:"COMMON",goal:1,metric:"foodEntries"},
  {id:"food_10",cat:"food",icon:"🥗",title:"Food Explorer",desc:"Log 10 food entries.",rarity:"COMMON",goal:10,metric:"foodEntries"},
  {id:"food_50",cat:"food",icon:"🛒",title:"Label Legend",desc:"Log 50 food entries.",rarity:"RARE",goal:50,metric:"foodEntries"},
  {id:"food_scan_10",cat:"food",icon:"📷",title:"Scanner Pro",desc:"Add 10 foods by barcode.",rarity:"RARE",goal:10,metric:"scannedFoods"},
  {id:"food_ontarget_5",cat:"food",icon:"🎯",title:"On Target",desc:"Check out within target on 5 days.",rarity:"RARE",goal:5,metric:"onTargetDays"},

  // Workout
  {id:"workout_first",cat:"workout",icon:"💪",title:"First Rep",desc:"Complete your first workout.",rarity:"COMMON",goal:1,metric:"workouts"},
  {id:"workout_5",cat:"workout",icon:"🏋️",title:"Getting Strong",desc:"Complete 5 workouts.",rarity:"COMMON",goal:5,metric:"workouts"},
  {id:"workout_25",cat:"workout",icon:"⚙️",title:"Routine Machine",desc:"Complete 25 workouts.",rarity:"RARE",goal:25,metric:"workouts"},
  {id:"workout_100",cat:"workout",icon:"🦾",title:"Iron Habit",desc:"Complete 100 workouts.",rarity:"EPIC",goal:100,metric:"workouts"},
  {id:"sets_100",cat:"workout",icon:"🔢",title:"Century Sets",desc:"Log 100 completed workout sets.",rarity:"RARE",goal:100,metric:"completedSets"},
  {id:"sets_500",cat:"workout",icon:"🏆",title:"Set Collector",desc:"Log 500 completed workout sets.",rarity:"EPIC",goal:500,metric:"completedSets"},

  // Walking
  {id:"walk_first",cat:"walking",icon:"🚶",title:"First Steps",desc:"Log your first walk.",rarity:"COMMON",goal:1,metric:"walks"},
  {id:"walk_1mi",cat:"walking",icon:"👟",title:"Mile One",desc:"Walk 1 mile in total.",rarity:"COMMON",goal:1,metric:"walkMiles"},
  {id:"walk_5mi",cat:"walking",icon:"🌳",title:"Five Mile Wanderer",desc:"Walk 5 miles in total.",rarity:"COMMON",goal:5,metric:"walkMiles"},
  {id:"walk_25mi",cat:"walking",icon:"🧭",title:"Trail Finder",desc:"Walk 25 miles in total.",rarity:"RARE",goal:25,metric:"walkMiles"},
  {id:"walk_100mi",cat:"walking",icon:"🥾",title:"Hundred Mile Club",desc:"Walk 100 miles in total.",rarity:"EPIC",goal:100,metric:"walkMiles"},
  {id:"walk_250mi",cat:"walking",icon:"⛰️",title:"Long Haul Walker",desc:"Walk 250 miles in total.",rarity:"LEGEND",goal:250,metric:"walkMiles"},

  // Running
  {id:"run_first",cat:"running",icon:"🏃",title:"Off The Mark",desc:"Log your first run.",rarity:"COMMON",goal:1,metric:"runs"},
  {id:"run_1mi",cat:"running",icon:"⚡",title:"First Mile",desc:"Run 1 mile in total.",rarity:"COMMON",goal:1,metric:"runMiles"},
  {id:"run_5mi",cat:"running",icon:"🏁",title:"Five Mile Flyer",desc:"Run 5 miles in total.",rarity:"COMMON",goal:5,metric:"runMiles"},
  {id:"run_25mi",cat:"running",icon:"🔥",title:"Road Burner",desc:"Run 25 miles in total.",rarity:"RARE",goal:25,metric:"runMiles"},
  {id:"run_100mi",cat:"running",icon:"🚀",title:"Hundred Mile Runner",desc:"Run 100 miles in total.",rarity:"EPIC",goal:100,metric:"runMiles"},
  {id:"run_250mi",cat:"running",icon:"🌠",title:"Distance Demon",desc:"Run 250 miles in total.",rarity:"LEGEND",goal:250,metric:"runMiles"},

  // Weekly Monday-reset challenges
  {id:"week_walk_5",cat:"weekly",icon:"📅",title:"Five This Week",desc:"Walk 5 miles between Monday and Sunday.",rarity:"COMMON",goal:5,metric:"weekWalkMiles"},
  {id:"week_walk_10",cat:"weekly",icon:"🌤️",title:"Double Digits",desc:"Walk 10 miles this week.",rarity:"RARE",goal:10,metric:"weekWalkMiles"},
  {id:"week_walk_20",cat:"weekly",icon:"🗺️",title:"Twenty Mile Week",desc:"Walk 20 miles this week.",rarity:"EPIC",goal:20,metric:"weekWalkMiles"},
  {id:"week_run_5",cat:"weekly",icon:"📅",title:"Running Week",desc:"Run 5 miles between Monday and Sunday.",rarity:"COMMON",goal:5,metric:"weekRunMiles"},
  {id:"week_run_10",cat:"weekly",icon:"💨",title:"Ten Mile Week",desc:"Run 10 miles this week.",rarity:"RARE",goal:10,metric:"weekRunMiles"},
  {id:"week_run_20",cat:"weekly",icon:"🏅",title:"Twenty Mile Runner",desc:"Run 20 miles this week.",rarity:"EPIC",goal:20,metric:"weekRunMiles"},
  {id:"week_combo_15",cat:"weekly",icon:"🌍",title:"Move 15",desc:"Walk and/or run 15 miles this week.",rarity:"RARE",goal:15,metric:"weekMoveMiles"},
  {id:"week_combo_30",cat:"weekly",icon:"🛰️",title:"Thirty Mile Week",desc:"Walk and/or run 30 miles this week.",rarity:"LEGEND",goal:30,metric:"weekMoveMiles"},

  // Consistency
  {id:"streak_3",cat:"consistency",icon:"🔥",title:"Three In A Row",desc:"Check out 3 days in a row.",rarity:"COMMON",goal:3,metric:"bestStreak"},
  {id:"streak_7",cat:"consistency",icon:"🔥",title:"Full Week",desc:"Reach a 7-day checkout streak.",rarity:"RARE",goal:7,metric:"bestStreak"},
  {id:"streak_14",cat:"consistency",icon:"🌟",title:"Fortnight Flow",desc:"Reach a 14-day checkout streak.",rarity:"EPIC",goal:14,metric:"bestStreak"},
  {id:"streak_30",cat:"consistency",icon:"👑",title:"Thirty Days",desc:"Reach a 30-day checkout streak.",rarity:"LEGEND",goal:30,metric:"bestStreak"},
  {id:"checkout_25",cat:"consistency",icon:"🌙",title:"Day Closer",desc:"Check out 25 days.",rarity:"RARE",goal:25,metric:"checkouts"},
  {id:"checkout_100",cat:"consistency",icon:"📘",title:"Hundred Days Logged",desc:"Check out 100 days.",rarity:"LEGEND",goal:100,metric:"checkouts"},

  // Scores
  {id:"score_70",cat:"score",icon:"⭐",title:"Seventy Club",desc:"Finish a day with CholScore 70+.",rarity:"COMMON",goal:1,metric:"score70Days"},
  {id:"score_80",cat:"score",icon:"🚀",title:"Flying",desc:"Finish a day with CholScore 80+.",rarity:"RARE",goal:1,metric:"score80Days"},
  {id:"score_90",cat:"score",icon:"💎",title:"Elite Day",desc:"Finish a day with CholScore 90+.",rarity:"EPIC",goal:1,metric:"score90Days"},
  {id:"score_90x5",cat:"score",icon:"🏆",title:"High Five",desc:"Finish 5 days with CholScore 90+.",rarity:"LEGEND",goal:5,metric:"score90Days"},
  {id:"points_500",cat:"score",icon:"✨",title:"500 Club",desc:"Bank 500 total CholPoints.",rarity:"RARE",goal:500,metric:"totalPoints"},
  {id:"points_2500",cat:"score",icon:"🌌",title:"Point Collector",desc:"Bank 2,500 total CholPoints.",rarity:"LEGEND",goal:2500,metric:"totalPoints"},
];

const rewardCategories = [
  ["all","All"],["food","Food"],["workout","Workout"],["walking","Walking"],
  ["running","Running"],["weekly","This Week"],["consistency","Consistency"],["score","CholScore"]
];

function achievementMetrics(){
  let foodEntries=0,scannedFoods=0,onTargetDays=0,workouts=0,completedSets=0,walks=0,runs=0;
  let walkMiles=0,runMiles=0,checkouts=0,score70Days=0,score80Days=0,score90Days=0,totalPoints=0;
  const checkedDates=[];

  const monday=mondayKeyFor(new Date());
  let weekWalkMiles=0,weekRunMiles=0;

  for(const [key,day] of Object.entries(state.days)){
    foodEntries += (day.foods||[]).length;
    scannedFoods += (day.foods||[]).filter(f=>f.source==="Open Food Facts").length;

    for(const a of (day.activities||[])){
      if(a.type==="workout"){
        workouts++;
        completedSets += Number(a.completedSets||0);
      }else if(a.type==="walk"){
        walks++;
        const dist=achievementDistanceValue(Number(a.distance||0));
        walkMiles += dist;
        if(key>=monday) weekWalkMiles += dist;
      }else if(a.type==="run"){
        runs++;
        const dist=achievementDistanceValue(Number(a.distance||0));
        runMiles += dist;
        if(key>=monday) weekRunMiles += dist;
      }
    }

    if(day.checkedOut){
      checkouts++;
      checkedDates.push(key);
      const score=Number(day.finalScore??scoreDay(day));
      totalPoints += score;
      if(score>=70) score70Days++;
      if(score>=80) score80Days++;
      if(score>=90) score90Days++;
      const t=totals(day), target=Number(state.profile?.target||30);
      if(day.foods?.length && t.sat<=target) onTargetDays++;
    }
  }

  checkedDates.sort();
  let bestStreak=0,current=0,prev=null;
  for(const key of checkedDates){
    const d=new Date(key+"T12:00:00");
    if(prev){
      const diff=Math.round((d-prev)/86400000);
      current=diff===1?current+1:1;
    }else current=1;
    bestStreak=Math.max(bestStreak,current);
    prev=d;
  }

  return {
    foodEntries,scannedFoods,onTargetDays,workouts,completedSets,walks,runs,
    walkMiles,runMiles,weekWalkMiles,weekRunMiles,weekMoveMiles:weekWalkMiles+weekRunMiles,
    checkouts,bestStreak,score70Days,score80Days,score90Days,totalPoints
  };
}


function achievementDisplay(def){
  const unit=distanceUnit();
  const long=unitLong();
  let title=def.title;
  let desc=def.desc;

  // All distance achievement definitions use numeric thresholds that are interpreted
  // in the user's chosen display unit.
  if(def.metric && def.metric.toLowerCase().includes("miles")){
    desc=desc.replace(/\bmiles\b/gi,long).replace(/\bmile\b/gi, unit==="km"?"kilometre":"mile");
    title=title.replace(/\bMile\b/g, unit==="km"?"Kilometre":"Mile")
               .replace(/\bMiles\b/g, unit==="km"?"Kilometres":"Miles");
  }
  return {title,desc};
}

function renderRewards(){
  const metrics=achievementMetrics();
  const unlocked=achievementDefs.filter(a=>Number(metrics[a.metric]||0)>=a.goal);
  const pct=achievementDefs.length?unlocked.length/achievementDefs.length*100:0;

  $("achievementUnlockedCount").textContent=unlocked.length;
  $("achievementTotalCount").textContent=achievementDefs.length;
  $("collectionProgressBar").style.width=`${pct}%`;
  $("rewardMessage").textContent=unlocked.length===achievementDefs.length
    ?`You collected everything, ${state.profile.name}!`
    :`${achievementDefs.length-unlocked.length} still waiting to be unlocked.`;

  const days=Object.entries(state.days).filter(([_,d])=>d.checkedOut);
  const totalPoints=metrics.totalPoints;
  const best=days.length?Math.max(...days.map(([_,d])=>Number(d.finalScore??scoreDay(d)))):scoreDay();
  $("pointsStat").textContent=Math.round(totalPoints);
  $("bestStat").textContent=Math.round(best);
  $("streakStat").textContent=calculateStreak();

  $("rewardCategoryTabs").innerHTML=rewardCategories.map(([id,label])=>
    `<button class="reward-tab ${activeRewardCategory===id?"active":""}" data-reward-cat="${id}">${label}</button>`
  ).join("");
  qsa("[data-reward-cat]").forEach(btn=>btn.addEventListener("click",()=>{
    activeRewardCategory=btn.dataset.rewardCat;renderRewards();
  }));

  const defs=activeRewardCategory==="all"?achievementDefs:achievementDefs.filter(a=>a.cat===activeRewardCategory);
  const unlockedHere=defs.filter(a=>Number(metrics[a.metric]||0)>=a.goal).length;
  const catLabel=rewardCategories.find(x=>x[0]===activeRewardCategory)?.[1]||"All";
  $("achievementCategorySummary").innerHTML=`<strong>${catLabel}</strong><span>${unlockedHere} of ${defs.length} unlocked</span>`;

  $("achievementCollection").innerHTML=defs.map(a=>{
    const value=Number(metrics[a.metric]||0);
    const done=value>=a.goal;
    const progress=Math.max(0,Math.min(100,value/a.goal*100));
    const displayVal=a.metric.toLowerCase().includes("miles")?value.toFixed(1):Math.floor(value);
    const goalVal=a.goal;
    const shown=achievementDisplay(a);
    return `<div class="achievement-card ${done?"unlocked":"locked"}">
      <span class="achievement-rarity">${a.rarity}</span>
      <span class="achievement-icon">${a.icon}</span>
      <h4>${esc(shown.title)}</h4>
      <p>${esc(shown.desc)}</p>
      <div class="achievement-mini-progress"><i style="width:${progress}%"></i></div>
      <div class="achievement-state">
        <span>${done?"UNLOCKED":"LOCKED"}</span>
        <span>${displayVal}/${goalVal}${a.metric.toLowerCase().includes("miles")?` ${distanceUnit()}`:""}</span>
      </div>
    </div>`;
  }).join("");
}
function calculateStreak(){
  let count=0,d=new Date();
  for(let i=0;i<365;i++){const key=d.toISOString().slice(0,10),day=state.days[key];if(day?.checkedOut)count++;else if(i>0)break;d.setDate(d.getDate()-1);}
  return count;
}
function renderCalendar(){
  const y=calendarDate.getFullYear(),m=calendarDate.getMonth();
  $("monthTitle").textContent=calendarDate.toLocaleDateString(undefined,{month:"long",year:"numeric"});
  const first=new Date(y,m,1),last=new Date(y,m+1,0),offset=(first.getDay()+6)%7,cells=[];
  for(let i=0;i<offset;i++)cells.push(`<button class="day-cell muted"></button>`);
  for(let d=1;d<=last.getDate();d++){const key=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`,has=!!state.days[key];cells.push(`<button class="day-cell ${has?"has-data":""}" data-date="${key}">${d}</button>`);}
  $("calendarGrid").innerHTML=cells.join("");
  qsa(".day-cell[data-date]").forEach(b=>b.addEventListener("click",()=>showHistoryDay(b.dataset.date,b)));
}
function showHistoryDay(key,btn){
  qsa(".day-cell").forEach(x=>x.classList.remove("selected"));btn.classList.add("selected");
  const day=getDay(key),t=totals(day),sc=day.finalScore??scoreDay(day),nice=new Date(key+"T12:00:00").toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  $("historyDetail").classList.remove("empty-state");
  $("historyDetail").innerHTML=`<h3>${nice}</h3><div class="history-grid"><div><span>Sat fat</span><strong>${fmt(t.sat)}g</strong></div><div><span>Movement</span><strong>${Math.round(t.mins)} min</strong></div><div><span>CholScore</span><strong>${sc}</strong></div></div><p style="color:#9299aa;font-size:12px;margin-bottom:0">${day.foods.length} food entries · ${day.activities.length} activities${day.checkedOut?" · checked out":""}</p>`;
}

/* Onboarding */
qsa(".target-option").forEach(btn=>btn.addEventListener("click",()=>{
  qsa(".target-option").forEach(x=>x.classList.remove("selected"));btn.classList.add("selected");
  selectedTarget=btn.dataset.target;$("customTargetWrap").classList.toggle("hidden",selectedTarget!=="custom");
}));

qsa(".unit-option").forEach(btn=>btn.addEventListener("click",()=>{
  qsa(".unit-option").forEach(x=>x.classList.remove("selected"));
  btn.classList.add("selected");
  selectedDistanceUnit=btn.dataset.unit;
}));

$("finishSetup").addEventListener("click",()=>{
  const name=$("nameInput").value.trim(),target=selectedTarget==="custom"?Number($("customTarget").value):Number(selectedTarget);
  if(!name||!target||target<=0)return alert("Please enter your name and choose a valid target.");
  state.profile={name,target,distanceUnit:selectedDistanceUnit};saveState();init();
});

/* Navigation */
qsa(".nav-btn").forEach(btn=>btn.addEventListener("click",()=>{
  qsa(".nav-btn").forEach(x=>x.classList.remove("active"));btn.classList.add("active");
  qsa(".view").forEach(x=>x.classList.remove("active"));$(btn.dataset.view).classList.add("active");renderAll();
}));


/* Friendly cancel behaviour — never validate when the user just wants to leave */
qsa("[data-close-dialog]").forEach(btn=>btn.addEventListener("click",()=>{
  const dlg=$(btn.dataset.closeDialog);
  if(dlg?.open) dlg.close();
}));

/* Clicking the shaded area outside a normal modal also closes it without validation */
qsa("dialog.modal").forEach(dlg=>{
  dlg.addEventListener("click",e=>{
    if(e.target===dlg) dlg.close();
  });
});

/* Food */
$("openFoodForm").addEventListener("click",()=>$("foodDialog").showModal());
$("foodForm").addEventListener("submit",e=>{
  e.preventDefault();const name=$("foodName").value.trim(),sat=Number($("satFat").value),meal=$("mealType").value;
  if(!name||Number.isNaN(sat))return;
  ensureDay().foods.push({id:id(),name,sat,meal,created:Date.now(),source:"Manual"});state.achievements.firstFood=true;saveState();$("foodDialog").close();e.target.reset();renderAll();
});

/* Barcode scanning + Open Food Facts */
async function openBarcodeScanner(purpose="add"){
  scannerPurpose=purpose;
  $("barcodeDialog").showModal();
  $("scannerStatus").textContent="Starting camera…";
  $("manualBarcodeInput").value="";
  await startBarcodeCamera();
}

async function startBarcodeCamera(){
  try{
    if(typeof Html5Qrcode === "undefined"){
      $("scannerStatus").textContent="Camera scanner couldn't load. You can enter the barcode manually below.";
      return;
    }
    await stopBarcodeCamera();

    barcodeScanner = new Html5Qrcode("scannerReader", false);
    const formats = [
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.CODE_128
    ];

    const config = {
      fps: 10,
      qrbox: { width: 280, height: 150 },
      aspectRatio: 1.6,
      formatsToSupport: formats,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true }
    };

    await barcodeScanner.start(
      { facingMode: "environment" },
      config,
      async(decodedText)=>{
        const barcode=String(decodedText||"").replace(/\D/g,"");
        if(!barcode) return;
        $("scannerStatus").textContent=`Barcode ${barcode} detected. Looking up product…`;
        if(navigator.vibrate) navigator.vibrate(80);
        await stopBarcodeCamera();
        $("barcodeDialog").close();
        await lookupBarcode(barcode, scannerPurpose);
      },
      ()=>{}
    );
    $("scannerStatus").textContent="Ready — point the camera at a food barcode.";
  }catch(err){
    console.error(err);
    $("scannerStatus").textContent="Camera couldn't start. Check camera permission, or enter the barcode manually below.";
  }
}

async function stopBarcodeCamera(){
  if(barcodeScanner){
    try{
      const stateNow=barcodeScanner.getState?.();
      if(stateNow===2 || stateNow===3) await barcodeScanner.stop();
      await barcodeScanner.clear();
    }catch(e){}
    barcodeScanner=null;
  }
}

async function closeBarcodeScanner(){
  await stopBarcodeCamera();
  if($("barcodeDialog").open) $("barcodeDialog").close();
}

async function lookupBarcode(barcode,purpose="add"){
  barcode=String(barcode||"").trim().replace(/\D/g,"");
  if(!barcode){
    alert("Enter a valid barcode number.");
    return;
  }

  try{
    const fields=[
      "code","product_name","product_name_en","brands","image_front_small_url",
      "serving_size","serving_quantity","nutrition_data_per","nutriments"
    ].join(",");
    const url=`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}?fields=${encodeURIComponent(fields)}`;
    const response=await fetch(url,{headers:{"Accept":"application/json"}});
    if(!response.ok) throw new Error(`Open Food Facts HTTP ${response.status}`);
    const data=await response.json();

    if(data.status!==1 || !data.product){
      $("productNotFoundDialog").showModal();
      return;
    }

    const p=data.product;
    const nutr=p.nutriments||{};
    const sat100=numberOrNull(nutr["saturated-fat_100g"]);
    const satServing=numberOrNull(nutr["saturated-fat_serving"]);
    const protein100=numberOrNull(nutr["proteins_100g"]);
    const proteinServing=numberOrNull(nutr["proteins_serving"]);
    const servingQty=numberOrNull(p.serving_quantity);

    currentProduct={
      barcode,
      name:p.product_name || p.product_name_en || `Product ${barcode}`,
      brand:p.brands || "",
      image:p.image_front_small_url || "",
      servingSize:p.serving_size || "",
      servingQty,
      sat100,
      satServing,
      protein100,
      proteinServing
    };
    if(purpose==="check"){
      checkedProduct={...currentProduct};
      showCheckFoodResult();
    }else{
      showProductDialog();
    }
  }catch(err){
    console.error(err);
    alert("CholScore couldn't reach Open Food Facts just now. Check your connection or add the food manually.");
  }
}

function numberOrNull(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}

function showProductDialog(){
  const p=currentProduct;if(!p)return;
  $("productName").textContent=p.name;
  $("productBrand").textContent=p.brand || "Open Food Facts product";
  $("productBarcode").textContent=`Barcode ${p.barcode}`;
  $("productSat100").textContent=p.sat100!=null?`${fmt(p.sat100)}g`:"Not supplied";

  const img=$("productImage");
  if(p.image){img.src=p.image;img.alt=p.name;img.classList.remove("hidden");}
  else{img.removeAttribute("src");img.classList.add("hidden");}

  const warn=$("productWarning");
  if(p.sat100==null && p.satServing==null){
    warn.textContent="Open Food Facts has this product, but saturated-fat information is missing. Please check the pack and add it manually.";
    warn.classList.remove("hidden");
  }else{
    warn.classList.add("hidden");
  }

  $("productAmount").value=p.servingQty || 100;
  $("productAmountUnit").value="g";

  const servingInfo=$("servingInfo");
  if(p.servingSize || p.servingQty || p.satServing!=null){
    let bits=[];
    if(p.servingSize) bits.push(`Listed serving: ${p.servingSize}`);
    else if(p.servingQty) bits.push(`Listed serving: ${p.servingQty}g`);
    if(p.satServing!=null) bits.push(`${fmt(p.satServing)}g saturated fat per serving`);
    servingInfo.textContent=bits.join(" · ");
    servingInfo.classList.remove("hidden");
    if(p.servingQty || p.satServing!=null){
      const unit=$("productAmountUnit");
      if(![...unit.options].some(o=>o.value==="serving")){
        unit.add(new Option("serving(s)","serving"));
      }
    }
  }else servingInfo.classList.add("hidden");

  recalcProductSat();
  $("productDialog").showModal();
}


function productProteinForAmount(product, amount, unit){
  if(!product) return 0;
  amount=Math.max(0,Number(amount||0));
  if(unit==="serving"){
    if(product.proteinServing!=null) return amount*product.proteinServing;
    if(product.servingQty && product.protein100!=null) return amount*product.servingQty/100*product.protein100;
    return 0;
  }
  return product.protein100!=null ? amount/100*product.protein100 : 0;
}

function recalcProductSat(){
  if(!currentProduct)return;
  const amount=Math.max(0,Number($("productAmount").value||0));
  const unit=$("productAmountUnit").value;
  let sat=0;

  if(unit==="serving"){
    if(currentProduct.satServing!=null){
      sat=amount*currentProduct.satServing;
    }else if(currentProduct.servingQty && currentProduct.sat100!=null){
      sat=amount*currentProduct.servingQty/100*currentProduct.sat100;
    }else{
      sat=0;
    }
  }else{
    sat=currentProduct.sat100!=null ? amount/100*currentProduct.sat100 : 0;
  }
  $("calculatedSat").textContent=fmt(sat);
}

$("scanBtn").addEventListener("click",()=>openBarcodeScanner("add"));
$("checkFoodBtn").addEventListener("click",()=>openBarcodeScanner("check"));
$("closeScannerBtn").addEventListener("click",closeBarcodeScanner);
$("barcodeDialog").addEventListener("cancel",e=>{e.preventDefault();closeBarcodeScanner();});

$("manualLookupBtn").addEventListener("click",async()=>{
  const code=$("manualBarcodeInput").value.trim();
  await stopBarcodeCamera();
  $("barcodeDialog").close();
  await lookupBarcode(code, scannerPurpose);
});
$("manualBarcodeInput").addEventListener("keydown",e=>{
  if(e.key==="Enter"){e.preventDefault();$("manualLookupBtn").click();}
});


function checkedSatForAmount(){
  if(!checkedProduct) return 0;
  const amount=Math.max(0,Number($("checkFoodAmount").value||0));
  const unit=$("checkFoodUnit").value;
  if(unit==="serving"){
    if(checkedProduct.satServing!=null) return amount*checkedProduct.satServing;
    if(checkedProduct.servingQty && checkedProduct.sat100!=null) return amount*checkedProduct.servingQty/100*checkedProduct.sat100;
    return 0;
  }
  return checkedProduct.sat100!=null ? amount/100*checkedProduct.sat100 : 0;
}

function showCheckFoodResult(){
  const p=checkedProduct;if(!p)return;
  $("checkFoodName").textContent=p.name;
  $("checkFoodBrand").textContent=p.brand || "Open Food Facts product";
  $("checkFoodBarcode").textContent=`Barcode ${p.barcode}`;

  const img=$("checkFoodImage"),fallback=$("checkFoodFallback");
  if(p.image){img.src=p.image;img.alt=p.name;img.classList.remove("hidden");fallback.classList.add("hidden");}
  else{img.removeAttribute("src");img.classList.add("hidden");fallback.classList.remove("hidden");}

  $("checkFoodAmount").value=p.servingQty || 100;
  $("checkFoodUnit").value="g";
  recalcCheckFoodImpact();
  $("checkFoodResultDialog").showModal();
}

function recalcCheckFoodImpact(){
  if(!checkedProduct || !state.profile)return;
  const day=getDay(), t=totals(day), target=Number(state.profile.target);
  const sat=checkedSatForAmount();
  const remainingNow=Math.max(0,target-t.sat);
  const afterRaw=target-(t.sat+sat);
  const remainingAfter=Math.max(0,afterRaw);

  $("impactSat").textContent=`${fmt(sat)}g`;
  $("impactRemainingNow").textContent=`${fmt(remainingNow)}g`;
  $("impactRemainingAfter").textContent=afterRaw>=0?`${fmt(remainingAfter)}g`:`${fmt(Math.abs(afterRaw))}g over`;

  // Project today's score if this food were added, without actually saving it.
  const projectedDay=JSON.parse(JSON.stringify(day));
  projectedDay.foods.push({name:checkedProduct.name,sat,meal:"Check"});
  const projected=scoreDay(projectedDay);
  $("impactProjectedScore").textContent=projected;

  const card=$("impactCard");
  card.classList.remove("good","close","over");

  if(checkedProduct.sat100==null && checkedProduct.satServing==null){
    $("impactHeadline").textContent="Nutrition data missing";
    $("impactDetail").textContent="Open Food Facts has the product, but not enough saturated-fat data to calculate the impact.";
    $("checkMessage").textContent="Check the nutrition label on the pack before deciding.";
    $("impactSat").textContent="—";
    return;
  }

  if(afterRaw >= target*.25){
    card.classList.add("good");
    $("impactHeadline").textContent="Fits comfortably today";
    $("impactDetail").textContent="You would still have a useful amount of your daily target left.";
    $("checkMessage").textContent=`This portion would use ${fmt(sat)}g of saturated fat and leave ${fmt(remainingAfter)}g today.`;
  }else if(afterRaw >= 0){
    card.classList.add("close");
    $("impactHeadline").textContent="Fits, but uses most of what's left";
    $("impactDetail").textContent="It stays within today's target, but doesn't leave much room afterwards.";
    $("checkMessage").textContent=`This portion would leave ${fmt(remainingAfter)}g remaining today.`;
  }else{
    card.classList.add("over");
    $("impactHeadline").textContent="Would take you over today's target";
    $("impactDetail").textContent=`By about ${fmt(Math.abs(afterRaw))}g at this portion size.`;
    $("checkMessage").textContent="That doesn't make it a 'bad' food — CholScore is just showing the impact so you can decide what works for you.";
  }
}

$("checkFoodAmount").addEventListener("input",recalcCheckFoodImpact);
$("checkFoodUnit").addEventListener("change",()=>{
  if($("checkFoodUnit").value==="serving") $("checkFoodAmount").value="1";
  else $("checkFoodAmount").value=checkedProduct?.servingQty||100;
  recalcCheckFoodImpact();
});

$("addCheckedFoodBtn").addEventListener("click",()=>{
  if(!checkedProduct)return;
  currentProduct={...checkedProduct};
  $("checkFoodResultDialog").close();
  showProductDialog();
});

$("productAmount").addEventListener("input",recalcProductSat);
$("productAmountUnit").addEventListener("change",()=>{
  if($("productAmountUnit").value==="serving") $("productAmount").value="1";
  else $("productAmount").value=currentProduct?.servingQty||100;
  recalcProductSat();
});

$("productAddForm").addEventListener("submit",e=>{
  e.preventDefault();
  if(!currentProduct)return;
  const sat=Number($("calculatedSat").textContent);
  const chosenMeal=$("productMeal").value;
  if(!chosenMeal) return;
  if((currentProduct.sat100==null && currentProduct.satServing==null) || !Number.isFinite(sat)){
    $("productDialog").close();
    $("foodName").value=currentProduct.name;
    $("mealType").value=$("productMeal").value;
    $("satFat").value="";
    $("foodDialog").showModal();
    return;
  }
  const amount=Number($("productAmount").value||0);
  const unit=$("productAmountUnit").value;
  const protein=productProteinForAmount(currentProduct,amount,unit);
  ensureDay().foods.push({
    id:id(),
    name:currentProduct.name,
    brand:currentProduct.brand,
    barcode:currentProduct.barcode,
    image:currentProduct.image || "",
    sat,
    protein,
    meal:chosenMeal,
    amount,
    amountUnit:unit,
    source:"Open Food Facts",
    created:Date.now()
  });
  state.achievements.firstFood=true;
  saveState();
  $("productDialog").close();
  currentProduct=null;
  renderAll();
});

$("manualFoodFromNotFound").addEventListener("click",()=>{
  $("productNotFoundDialog").close();
  $("foodDialog").showModal();
});


/* Routine builder */
function addRoutineExerciseRow(data={name:"",sets:3,reps:10,weight:"",notes:"",id:"",timed:false}){
  const row=document.createElement("div");row.className="routine-exercise-row";
  if(data.id) row.dataset.exerciseId=data.id;
  const isTimed=Boolean(data.timed);
  row.innerHTML=`
    <div class="rb-main-fields">
      <label>Exercise<input class="rb-name" required placeholder="e.g. Bench press or Plank" value="${esc(data.name)}"></label>
      <label class="timed-exercise-toggle">
        <input class="rb-timed" type="checkbox" ${isTimed?"checked":""}>
        <span><b>⏱ Timed exercise</b><small>Use a stopwatch for each set instead of entering reps.</small></span>
      </label>
      <div class="rb-number-grid">
        <label>Sets<input class="rb-sets" type="number" min="1" max="20" value="${Number(data.sets)||3}" required></label>
        <label class="rb-reps-label">Reps<input class="rb-reps" type="number" min="1" max="200" value="${Number(data.reps)||10}" ${isTimed?"disabled":""}></label>
        <label>Weight (kg)<input class="rb-weight" type="number" min="0" step="0.5" placeholder="Optional" value="${Number(data.weight)>0?Number(data.weight):""}"></label>
      </div>
      <label>Exercise notes<textarea class="rb-notes" rows="2" placeholder="Optional cue or reminder">${esc(data.notes||"")}</textarea></label>
    </div>
    <button type="button" class="row-remove" aria-label="Remove exercise">×</button>`;
  const timed=row.querySelector(".rb-timed"),reps=row.querySelector(".rb-reps"),repsLabel=row.querySelector(".rb-reps-label");
  const syncTimed=()=>{
    reps.disabled=timed.checked;
    repsLabel.classList.toggle("timed-disabled",timed.checked);
  };
  timed.addEventListener("change",syncTimed);syncTimed();
  row.querySelector(".row-remove").addEventListener("click",()=>row.remove());
  $("routineExerciseRows").appendChild(row);
}
function openRoutineBuilder(){
  editingRoutineId=null;
  $("routineDialogTitle").textContent="Create routine";
  $("saveRoutineBtn").textContent="Save routine";
  $("routineName").value="";
  $("routineExerciseRows").innerHTML="";
  addRoutineExerciseRow();addRoutineExerciseRow();addRoutineExerciseRow();
  $("routineDialog").showModal();
}

function openRoutineEditor(rid){
  const routine=state.routines.find(r=>r.id===rid);
  if(!routine)return;
  editingRoutineId=rid;
  $("routineDialogTitle").textContent="Edit routine";
  $("saveRoutineBtn").textContent="Save changes";
  $("routineName").value=routine.name;
  $("routineExerciseRows").innerHTML="";
  routine.exercises.forEach(e=>addRoutineExerciseRow(e));
  $("routineDialog").showModal();
}

$("newRoutineBtn").addEventListener("click",openRoutineBuilder);
$("addRoutineExercise").addEventListener("click",()=>addRoutineExerciseRow());

$("routineForm").addEventListener("submit",e=>{
  e.preventDefault();
  const name=$("routineName").value.trim();
  const exercises=qsa(".routine-exercise-row").map(row=>{
    const timed=row.querySelector(".rb-timed").checked;
    return {
      id:row.dataset.exerciseId||id(),
      name:row.querySelector(".rb-name").value.trim(),
      sets:Number(row.querySelector(".rb-sets").value),
      reps:timed?0:Number(row.querySelector(".rb-reps").value),
      weight:Number(row.querySelector(".rb-weight").value||0),
      notes:row.querySelector(".rb-notes").value.trim(),
      timed
    };
  }).filter(x=>x.name&&x.sets>0&&(x.timed||x.reps>0));

  if(!name)return alert("Give your routine a name.");
  if(!exercises.length)return alert("Add at least one exercise.");

  if(editingRoutineId){
    const routine=state.routines.find(r=>r.id===editingRoutineId);
    if(routine){
      routine.name=name;
      routine.exercises=exercises;
      routine.updated=Date.now();
    }
  }else{
    state.routines.push({id:id(),name,exercises,created:Date.now()});
  }

  saveState();
  editingRoutineId=null;
  $("routineDialog").close();
  renderExercise();
});
function deleteRoutine(rid){
  const r=state.routines.find(x=>x.id===rid);if(!r)return;
  if(confirm(`Delete "${r.name}"?`)){state.routines=state.routines.filter(x=>x.id!==rid);saveState();renderExercise();}
}

/* Live workouts */
const exerciseCheers=[
  "Brilliant work",
  "You nailed that one",
  "Strong work",
  "That is another one done",
  "Excellent effort",
  "Great job — keep it moving"
];
const workoutCheers=[
  "Amazing work",
  "Outstanding effort",
  "Brilliant session",
  "What a workout",
  "Superb work",
  "Fantastic effort"
];
const workoutSubCheers=[
  "You smashed that workout! 💪",
  "That was seriously strong work! ⭐",
  "Another brilliant workout in the bank! 🎉",
  "You brought the effort today! 💪",
  "That session absolutely counted! ✨",
  "Strong, focused and finished! ⭐"
];
function randomFrom(items){return items[Math.floor(Math.random()*items.length)];}
function routineExerciseForWorkoutExercise(w,e){
  const routine=state.routines.find(r=>r.id===w?.routineId);
  if(!routine)return null;
  return routine.exercises.find(x=>x.id===e?.sourceExerciseId)
    || routine.exercises.find(x=>String(x.name||"").trim().toLowerCase()===String(e?.name||"").trim().toLowerCase())
    || null;
}
function resolvedWorkoutWeight(w,e){
  const direct=Number(e?.weight||0);
  if(direct>0)return direct;
  const source=routineExerciseForWorkoutExercise(w,e);
  const fallback=Number(source?.weight||0);
  return fallback>0?fallback:0;
}
function ensureWorkoutShape(w){
  if(!w)return;
  if(!Number.isInteger(w.currentExerciseIndex)) w.currentExerciseIndex=0;
  w.exercises=(w.exercises||[]).map(e=>{
    const weight=resolvedWorkoutWeight(w,e);
    return {
      ...e,weight,notes:e.notes||"",timed:Boolean(e.timed),exerciseComplete:Boolean(e.exerciseComplete),
      sets:(e.sets||[]).map(set=>({
        ...set,actual:set.actual??"",timedSeconds:Number(set.timedSeconds||0),timerStartedAt:set.timerStartedAt||null,
        completed:typeof set.completed==="boolean"?set.completed:String(set.actual??"").trim()!==""
      }))
    };
  });
  w.currentExerciseIndex=Math.max(0,Math.min(w.currentExerciseIndex,Math.max(0,w.exercises.length-1)));
}
function exerciseVolume(e,w=null){
  const weight=w?resolvedWorkoutWeight(w,e):Number(e?.weight||0);
  if(weight<=0)return 0;
  return (e.sets||[]).reduce((sum,set)=>{
    const reps=Number(set.actual||0);
    return sum+((set.completed||String(set.actual??"").trim()!=="")&&reps>0?reps*weight:0);
  },0);
}
function workoutVolume(w){
  if(!w)return 0;
  ensureWorkoutShape(w);
  return (w.exercises||[]).reduce((sum,e)=>sum+exerciseVolume(e,w),0);
}
function allSetsComplete(e){return Boolean(e?.sets?.length)&&e.sets.every(s=>s.completed&&(e.timed?Number(s.timedSeconds||s.actual||0)>0:String(s.actual).trim()!==""));}
function startRoutine(rid){
  if(state.activeWorkout){alert("You already have a workout in progress. Finish or continue that workout first.");return;}
  const r=state.routines.find(x=>x.id===rid);if(!r)return;
  state.activeWorkout={
    id:id(),routineId:r.id,name:r.name,startedAt:new Date().toISOString(),currentExerciseIndex:0,
    exercises:r.exercises.map(e=>({
      id:id(),sourceExerciseId:e.id,name:e.name,targetReps:e.reps,weight:Number(e.weight||0),notes:e.notes||"",timed:Boolean(e.timed),random:false,exerciseComplete:false,
      sets:Array.from({length:e.sets},()=>({actual:"",timedSeconds:0,timerStartedAt:null,completed:false}))
    }))
  };
  saveState();openWorkout();
}
function openWorkout(){
  if(!state.activeWorkout)return;
  ensureWorkoutShape(state.activeWorkout);saveState();
  $("liveWorkoutTitle").textContent=state.activeWorkout.name;renderLiveExercises();
  $("workoutDialog").showModal();startWorkoutTimer();
}
function startWorkoutTimer(){
  clearInterval(workoutTimer);
  const tick=()=>{
    if(!state.activeWorkout){clearInterval(workoutTimer);return;}
    $("liveWorkoutClock").textContent=elapsedClock(state.activeWorkout.startedAt);
    showActiveWorkoutBanner();
  };
  tick();workoutTimer=setInterval(tick,1000);
}
function renderLiveExercises(){
  const w=state.activeWorkout;if(!w)return;ensureWorkoutShape(w);
  const ei=w.currentExerciseIndex||0,e=w.exercises[ei];
  if(!e){showWorkoutCelebration();return;}
  clearTimedSetTimers();
  const done=e.sets.filter(s=>s.completed).length;
  $("workoutProgress").innerHTML=`<div><span>EXERCISE ${ei+1} OF ${w.exercises.length}</span><strong>${done}/${e.sets.length} sets complete</strong></div><div class="guided-progress-bar"><i style="width:${(done/e.sets.length)*100}%"></i></div>`;
  const descriptor=e.timed?`Timed exercise · ${e.sets.length} ${e.sets.length===1?"set":"sets"}`:`${e.targetReps} target reps per set${Number(e.weight)>0?` · <b>${fmt(e.weight)} kg</b>`:""}`;
  const setMarkup=e.timed
    ? e.sets.map((set,si)=>`
        <div class="guided-set-row timed-set-row ${set.completed?"is-complete":""}" data-timed-row="${si}">
          <span>SET ${si+1}</span>
          <div class="timed-set-controls">
            <strong class="timed-set-display" data-timed-display="${si}">${set.completed?formatExerciseSeconds(set.timedSeconds||set.actual):"Ready"}</strong>
            <button type="button" class="timed-set-btn ${set.timerStartedAt?"is-running":""}" data-timed-set="${si}" ${set.completed?"disabled":""}>${set.timerStartedAt?"Stop":"⏱ Start"}</button>
            <b class="set-tick" aria-label="${set.completed?"Complete":"Not complete"}">${set.completed?"✓":""}</b>
          </div>
        </div>`).join("")
    : e.sets.map((set,si)=>`
        <label class="guided-set-row ${set.completed?"is-complete":""}">
          <span>SET ${si+1}</span>
          <div class="guided-rep-entry">
            <input inputmode="numeric" type="number" min="0" max="999" placeholder="${e.targetReps}" value="${esc(set.actual)}" data-workout-set="${si}" aria-label="Set ${si+1} reps">
            <b class="set-tick" aria-label="${set.completed?"Complete":"Not complete"}">${set.completed?"✓":""}</b>
          </div>
        </label>`).join("");

  $("liveExerciseList").innerHTML=`
    <div class="guided-exercise-card">
      <div class="guided-exercise-heading">
        <span class="guided-count">${String(ei+1).padStart(2,"0")}</span>
        <div><p class="eyebrow">CURRENT EXERCISE</p><h3>${esc(e.name)}</h3><p>${descriptor}${e.random?` · <b class="random-tag">added today</b>`:""}</p></div>
      </div>
      ${e.notes?`<div class="exercise-note"><span>NOTE</span>${esc(e.notes)}</div>`:""}
      <div class="guided-set-list">${setMarkup}</div>
      <p class="enter-hint">${e.timed?"Tap Start for a 3–2–1 countdown. The stopwatch runs until you press Stop.":"Enter your reps, then press Enter / Done to tick off each set."}</p>
      <button id="completeCurrentExerciseBtn" class="complete-exercise-btn" ${allSetsComplete(e)?"":"disabled"}>Complete exercise</button>
    </div>`;

  if(e.timed){
    // If the app was re-rendered while a timed set was running, resume its live display.
    const runningIndex=e.sets.findIndex(s=>s.timerStartedAt&&!s.completed);
    if(runningIndex>=0) resumeTimedSet(ei,runningIndex);
    qsa("[data-timed-set]").forEach(btn=>btn.addEventListener("click",()=>handleTimedSet(ei,Number(btn.dataset.timedSet))));
  }else{
    qsa("[data-workout-set]").forEach(inp=>{
      inp.addEventListener("input",()=>{
        const si=Number(inp.dataset.workoutSet),set=state.activeWorkout?.exercises?.[ei]?.sets?.[si];
        if(!set)return;set.actual=inp.value;set.completed=false;saveState();
        const row=inp.closest(".guided-set-row");row?.classList.remove("is-complete");const tick=row?.querySelector(".set-tick");if(tick)tick.textContent="";
        const btn=$("completeCurrentExerciseBtn");if(btn)btn.disabled=true;
      });
      const markComplete=()=>{
        if(String(inp.value).trim()==="")return;
        const si=Number(inp.dataset.workoutSet),set=state.activeWorkout?.exercises?.[ei]?.sets?.[si];if(!set)return;
        set.actual=inp.value;set.completed=true;saveState();renderLiveExercises();
        const next=qsa("[data-workout-set]").find(x=>Number(x.dataset.workoutSet)>si&&!state.activeWorkout.exercises[ei].sets[Number(x.dataset.workoutSet)].completed);
        if(next) setTimeout(()=>next.focus(),0);
      };
      inp.addEventListener("keydown",ev=>{if(ev.key==="Enter"){ev.preventDefault();markComplete();}});
      inp.addEventListener("change",markComplete);
    });
  }
  $("completeCurrentExerciseBtn")?.addEventListener("click",completeCurrentExercise);
}
function handleTimedSet(ei,si){
  const w=state.activeWorkout,e=w?.exercises?.[ei],set=e?.sets?.[si];if(!set||set.completed)return;
  if(set.timerStartedAt){stopTimedSet(ei,si);return;}
  // Only one stopwatch can run at a time.
  const other=e.sets.findIndex((s,i)=>i!==si&&s.timerStartedAt&&!s.completed);
  if(other>=0)return;

  clearTimedSetTimers();
  const btn=document.querySelector(`[data-timed-set="${si}"]`);
  const display=document.querySelector(`[data-timed-display="${si}"]`);
  if(btn)btn.disabled=true;
  let count=3;
  if(display)display.textContent=count;
  timedCountdownTimer=setInterval(()=>{
    count-=1;
    if(count>0){if(display)display.textContent=count;return;}
    clearInterval(timedCountdownTimer);timedCountdownTimer=null;
    set.timerStartedAt=new Date().toISOString();set.timedSeconds=0;set.actual="";saveState();
    if(btn){btn.disabled=false;btn.textContent="Stop";btn.classList.add("is-running");}
    resumeTimedSet(ei,si);
  },1000);
}
function resumeTimedSet(ei,si){
  clearInterval(timedSetTimer);
  const set=state.activeWorkout?.exercises?.[ei]?.sets?.[si];if(!set?.timerStartedAt)return;
  const started=new Date(set.timerStartedAt).getTime();
  const display=document.querySelector(`[data-timed-display="${si}"]`);
  const btn=document.querySelector(`[data-timed-set="${si}"]`);
  if(btn){btn.textContent="Stop";btn.classList.add("is-running");}
  const tick=()=>{
    const seconds=Math.max(0,Math.floor((Date.now()-started)/1000));
    if(display)display.textContent=formatExerciseSeconds(seconds);
  };
  tick();timedSetTimer=setInterval(tick,250);
}
function stopTimedSet(ei,si){
  const set=state.activeWorkout?.exercises?.[ei]?.sets?.[si];if(!set?.timerStartedAt)return;
  const seconds=Math.max(1,Math.round((Date.now()-new Date(set.timerStartedAt).getTime())/1000));
  clearTimedSetTimers();
  set.timedSeconds=seconds;set.actual=String(seconds);set.timerStartedAt=null;set.completed=true;saveState();
  renderLiveExercises();
}
function completeCurrentExercise(){
  const w=state.activeWorkout;if(!w)return;const ei=w.currentExerciseIndex||0,e=w.exercises[ei];if(!e||!allSetsComplete(e))return;
  clearTimedSetTimers();
  e.exerciseComplete=true;e.completedAt=new Date().toISOString();saveState();
  const volume=exerciseVolume(e);
  const timedTotal=e.timed?e.sets.reduce((sum,s)=>sum+Number(s.timedSeconds||s.actual||0),0):0;
  const bestTimed=e.timed?Math.max(...e.sets.map(s=>Number(s.timedSeconds||s.actual||0))):0;
  $("exerciseCompleteTitle").textContent=`${randomFrom(exerciseCheers)}, ${state.profile.name}!`;
  $("exerciseCompleteMessage").textContent=e.timed
    ? `${e.name} complete — ${formatExerciseSeconds(timedTotal)} held across ${e.sets.length} ${e.sets.length===1?"set":"sets"}. ${ei<w.exercises.length-1?"Take that momentum into the next one.":"That was the final exercise — workout complete!"}`
    : `${e.name} complete. ${ei<w.exercises.length-1?"Take that momentum into the next one.":"That was the final exercise — workout complete!"}`;
  $("exerciseCompleteStats").innerHTML=e.timed
    ? `<div><span>SETS</span><strong>${e.sets.length} ✓</strong></div><div><span>TOTAL TIME</span><strong>${formatExerciseSeconds(timedTotal)}</strong></div><div><span>BEST SET</span><strong>${formatExerciseSeconds(bestTimed)}</strong></div>`
    : `<div><span>SETS</span><strong>${e.sets.length} ✓</strong></div>${Number(e.weight)>0?`<div><span>WEIGHT</span><strong>${fmt(e.weight)} kg</strong></div><div><span>VOLUME</span><strong>${fmt(volume)} kg</strong></div>`:""}`;
  $("nextExerciseBtn").textContent=ei<w.exercises.length-1?"Next exercise":"See workout result";
  $("exerciseCompleteDialog").showModal();
}
$("nextExerciseBtn").addEventListener("click",()=>{
  clearTimedSetTimers();
  const w=state.activeWorkout;if(!w)return;$("exerciseCompleteDialog").close();
  if((w.currentExerciseIndex||0)<w.exercises.length-1){w.currentExerciseIndex+=1;saveState();renderLiveExercises();}
  else showWorkoutCelebration();
});
let confettiLoopTimer=null;
function spawnConfettiPiece(container){
  const colors=["#8d36ff","#f8bd36","#ea62c8","#fff0ba","#54d9ff"];
  const p=document.createElement("i");
  const isCircle=Math.random()<0.32;
  p.className="confetti-piece"+(isCircle?" circle":"");
  const size=6+Math.random()*7;
  p.style.width=(isCircle?size:size*0.68)+"px";
  p.style.height=(isCircle?size:size*1.75)+"px";
  p.style.left=(Math.random()*100)+"%";
  p.style.background=colors[Math.floor(Math.random()*colors.length)];
  p.style.setProperty("--sway",(Math.random()*70-35)+"px");
  p.style.setProperty("--rot",(360+Math.random()*540)+"deg");
  const duration=1.5+Math.random()*1.15;
  p.style.animationDuration=duration+"s";
  container.appendChild(p);
  setTimeout(()=>p.remove(),duration*1000+60);
}
function startConfettiLoop(container){
  stopConfettiLoop();
  if(!container)return;
  container.innerHTML="";
  const drop=()=>{for(let i=0;i<4;i++)spawnConfettiPiece(container);};
  drop();
  confettiLoopTimer=setInterval(drop,220);
}
function stopConfettiLoop(){
  if(confettiLoopTimer){clearInterval(confettiLoopTimer);confettiLoopTimer=null;}
  const c=$("confettiBurst");if(c)c.innerHTML="";
}
// Confetti should only run while the completion screen is actually on
// screen — stop it the instant the dialog closes, however it closes
// (Done button, cancel workout, Esc key, etc.), so it never keeps
// spawning in the background.
$("finishFeelingDialog").addEventListener("close",stopConfettiLoop);
function showWorkoutCelebration(){
  const w=state.activeWorkout;if(!w)return;clearInterval(workoutTimer);
  const mins=Math.max(1,elapsedMinutes(w.startedAt)),volume=workoutVolume(w);
  $("finishFeelingTitle").innerHTML=`<span>${esc(randomFrom(workoutCheers))},</span> <strong>${esc(state.profile.name)}!</strong>`;
  $("finishWorkoutSummary").textContent=randomFrom(workoutSubCheers);
  $("finishTotalWeight").textContent=volume>0?`${fmt(volume)} kg`:"—";
  $("finishWorkoutDuration").textContent=mins<60?`${mins} min`:elapsedClock(w.startedAt);
  finishFeeling=3;qsa("[data-finish-feel]").forEach(x=>x.classList.toggle("selected",x.dataset.finishFeel==="3"));
  startConfettiLoop($("confettiBurst"));

  // The completion screen is a fresh full-screen moment, not a continuation
  // of the scrolled live-workout sheet.
  const result=$("finishFeelingDialog");
  if($("workoutDialog").open) $("workoutDialog").close();
  result.scrollTop=0;
  if(!result.open) result.showModal();
  result.scrollTop=0;
  requestAnimationFrame(()=>{
    result.scrollTop=0;
    result.querySelector(".premium-star")?.scrollIntoView({block:"start",behavior:"instant"});
    result.scrollTop=0;
  });
}
$("continueWorkoutBtn").addEventListener("click",openWorkout);
$("minimiseWorkoutBtn").addEventListener("click",()=>{clearInterval(workoutTimer);clearTimedSetTimers();$("workoutDialog").close();renderExercise();});
$("cancelWorkoutBtn").addEventListener("click",()=>{
  const w=state.activeWorkout;if(!w)return;
  const ok=confirm(`Cancel "${w.name}"?\n\nThis unfinished workout will be discarded and won't be added to History. Your saved routine will stay unchanged.`);
  if(!ok)return;
  clearInterval(workoutTimer);clearTimedSetTimers();
  state.activeWorkout=null;
  saveState();
  if($("exerciseCompleteDialog").open) $("exerciseCompleteDialog").close();
  if($("finishFeelingDialog").open) $("finishFeelingDialog").close();
  if($("workoutDialog").open) $("workoutDialog").close();
  renderAll();
});
$("addRandomExerciseBtn").addEventListener("click",()=>{$("randomExerciseName").value="";$("randomExerciseSets").value=3;$("randomExerciseReps").value=10;$("randomExerciseWeight").value="";$("randomExerciseNotes").value="";$("randomExerciseDialog").showModal();});
$("randomExerciseForm").addEventListener("submit",e=>{
  e.preventDefault();if(!state.activeWorkout)return;
  const name=$("randomExerciseName").value.trim(),sets=Number($("randomExerciseSets").value),reps=Number($("randomExerciseReps").value),weight=Number($("randomExerciseWeight").value||0),notes=$("randomExerciseNotes").value.trim();
  if(!name||sets<1||reps<1)return;
  state.activeWorkout.exercises.push({id:id(),name,targetReps:reps,weight,notes,timed:false,random:true,exerciseComplete:false,sets:Array.from({length:sets},()=>({actual:"",timedSeconds:0,timerStartedAt:null,completed:false}))});
  saveState();$("randomExerciseDialog").close();renderLiveExercises();
});
qsa("[data-finish-feel]").forEach(btn=>btn.addEventListener("click",()=>{
  finishFeeling=Number(btn.dataset.finishFeel);qsa("[data-finish-feel]").forEach(x=>x.classList.toggle("selected",x===btn));
}));
$("saveFinishedWorkout").addEventListener("click",()=>{
  const w=state.activeWorkout;if(!w)return;
  const endedAt=new Date().toISOString(),minutes=Math.max(1,elapsedMinutes(w.startedAt,new Date(endedAt).getTime()));
  const completedSets=w.exercises.reduce((n,e)=>n+e.sets.filter(s=>s.completed||String(s.actual).trim()!=="").length,0);
  const plannedSets=w.exercises.reduce((n,e)=>n+e.sets.length,0);
  const totalWeight=workoutVolume(w);
  ensureDay().activities.push({
    id:w.id,type:"workout",name:w.name,minutes,feel:finishFeeling,created:Date.now(),
    startedAt:w.startedAt,endedAt,exerciseCount:w.exercises.length,completedSets,plannedSets,totalWeight,
    exercises:w.exercises
  });
  state.activeWorkout=null;state.achievements.firstMove=true;saveState();
  $("finishFeelingDialog").close();$("workoutDialog").close();renderAll();
});

/* Quick activities */
qsa(".quick-activity").forEach(btn=>btn.addEventListener("click",()=>{
  $("activityType").value=btn.dataset.type;
  $("activityName").value=btn.dataset.type==="walk"?"Walk":btn.dataset.type==="run"?"Run":"";
  $("exerciseDialog").showModal();
}));
qsa("#quickFeelingRow button").forEach(btn=>btn.addEventListener("click",()=>{
  qsa("#quickFeelingRow button").forEach(x=>x.classList.remove("selected"));btn.classList.add("selected");selectedFeeling=Number(btn.dataset.feel);
}));
$("exerciseForm").addEventListener("submit",e=>{
  e.preventDefault();
  const name=$("activityName").value.trim(),start=$("startTime").value,finish=$("finishTime").value,type=$("activityType").value;
  if(!name||!start||!finish)return;
  const minutes=minutesBetween(start,finish),distance=displayToKm(Number($("distance").value||0)),feel=selectedFeeling;
  ensureDay().activities.push({id:id(),name,start,finish,type,minutes,distance,feel,created:Date.now()});
  state.achievements.firstMove=true;saveState();$("exerciseDialog").close();e.target.reset();selectedFeeling=3;
  qsa("#quickFeelingRow button").forEach(x=>x.classList.toggle("selected",x.dataset.feel==="3"));renderAll();
  setTimeout(()=>alert(`Great work, ${state.profile.name}! ${minutes} minutes completed. ${feelEmoji(feel)}`),70);
});


/* Delete mistakenly logged food and recalculate the whole day immediately */
$("deleteFoodBtn").addEventListener("click",()=>{
  const day=ensureDay();

  let index=-1;

  if(currentFoodDetailId){
    index=day.foods.findIndex(f=>String(f.id||"")===String(currentFoodDetailId));
  }

  // Safety fallback for legacy records opened before they had an ID.
  if(index<0 && currentFoodDetailRef){
    index=day.foods.findIndex(f=>f===currentFoodDetailRef);
  }

  // Last-resort content match for very old localStorage entries.
  if(index<0 && currentFoodDetailRef){
    index=day.foods.findIndex(f=>
      f.name===currentFoodDetailRef.name &&
      Number(f.sat||0)===Number(currentFoodDetailRef.sat||0) &&
      f.meal===currentFoodDetailRef.meal &&
      Number(f.created||0)===Number(currentFoodDetailRef.created||0)
    );
  }

  if(index<0){
    alert("CholScore couldn't identify that old food record. Close it, reopen the food entry and try again.");
    return;
  }

  const food=day.foods[index];
  if(!confirm(`Delete "${food.name}" from today?`)) return;

  day.foods.splice(index,1);

  if(day.checkedOut){
    day.finalScore=scoreDay(day);
  }

  currentFoodDetailId=null;
  currentFoodDetailRef=null;
  saveState();
  $("foodDetailDialog").close();
  renderAll();
});

/* Checkout */
$("checkoutBtn").addEventListener("click",()=>{
  const day=ensureDay(),score=scoreDay(day),{sat,mins}=totals(day),target=Number(state.profile.target);
  day.checkedOut=true;day.finalScore=score;if(sat<=target&&day.foods.length)state.achievements.onTarget=true;if(score>=80)state.achievements.score80=true;saveState();
  $("checkoutScore").textContent=score;$("checkoutTitle").textContent=score>=90?`Outstanding, ${state.profile.name}!`:score>=75?`Brilliant day, ${state.profile.name}!`:score>=55?`Nice work, ${state.profile.name}!`:`Day complete, ${state.profile.name}.`;
  const satText=sat<=target?`You finished ${fmt(target-sat)}g inside your saturated-fat target.`:`You logged ${fmt(sat)}g of saturated fat today.`;
  $("checkoutText").textContent=`${satText}${mins?` You also completed ${Math.round(mins)} minutes of activity.`:""} Keep building on the positives.`;
  $("checkoutDialog").showModal();renderAll();
});
$("closeCheckout").addEventListener("click",()=>$("checkoutDialog").close());

/* History/profile */
$("prevMonth").addEventListener("click",()=>{calendarDate.setMonth(calendarDate.getMonth()-1);renderCalendar();});
$("nextMonth").addEventListener("click",()=>{calendarDate.setMonth(calendarDate.getMonth()+1);renderCalendar();});
$("profileBtn").addEventListener("click",()=>{$("settingsName").value=state.profile.name;$("settingsTarget").value=state.profile.target;$("settingsUnits").value=distanceUnit();$("settingsDialog").showModal();});
$("saveSettings").addEventListener("click",()=>{const n=$("settingsName").value.trim(),t=Number($("settingsTarget").value),u=$("settingsUnits").value==="km"?"km":"mi";if(n&&t>0){state.profile={...state.profile,name:n,target:t,distanceUnit:u};saveState();renderAll();}});
$("resetData").addEventListener("click",()=>{if(confirm("Reset all CholScore data on this device?")){localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(LEGACY_KEY);state=cloneDefault();$("settingsDialog").close();location.reload();}});

init();
