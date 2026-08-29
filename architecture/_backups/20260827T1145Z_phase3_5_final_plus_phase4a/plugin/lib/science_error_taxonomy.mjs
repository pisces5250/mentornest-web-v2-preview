// Science Error Taxonomy v1 — deterministic, pure data; never modifies mastery.
export const SCIENCE_ERROR_TAXONOMY = [
  {code:"SCI-CON-DISCIPLINE",category:"concept",label_zh:"物理、化學、生物基本概念混淆",description:"未分辨科學學科的基本現象與核心概念。",examples:["把蒸發當成化學變化","把細胞當成器官"],hint_template:"先回憶這個現象屬於哪一個科學領域，再說出它最重要的特徵。",mini_lesson_hint:"用生活例子比較物理、化學與生物概念。"},
  {code:"SCI-CON-QUANTITY-UNIT",category:"concept",label_zh:"量與單位概念",description:"不理解量、單位或測量值所代表的意義。",examples:["把質量與重量當成同一個量","讀錯毫升與公升"],hint_template:"先寫出量名，再檢查單位是否和題目要求相符。",mini_lesson_hint:"量名、單位、估讀與有效數字的配對練習。"},
  {code:"SCI-CON-STATE",category:"concept",label_zh:"物質三態",description:"混淆固體、液體、氣體的粒子排列與性質。",examples:["認為液體粒子固定不動","把水蒸氣說成看得見的白煙"],hint_template:"從粒子排列、體積與形狀三個方向比較三態。",mini_lesson_hint:"粒子模型三態互動圖。"},
  {code:"SCI-CON-FORCE-MOTION",category:"concept",label_zh:"力與運動",description:"混淆力、質量、速度、加速度與運動狀態。",examples:["物體停止就表示沒有受力","質量大的物體速度一定大"],hint_template:"分別找出施力者、受力者，以及物體運動狀態改變的原因。",mini_lesson_hint:"力圖與運動狀態判讀。"},
  {code:"SCI-CON-ENERGY",category:"concept",label_zh:"能量守恆",description:"不理解能量轉換、轉移與守恆。",examples:["能量消失不見了","把電能全部變成熟而沒有輸出"],hint_template:"列出過程前後的能量形式，確認總能量是否守恆。",mini_lesson_hint:"能量轉換流程圖與輸入輸出追蹤。"},
  {code:"SCI-CON-CELL-TISSUE",category:"concept",label_zh:"細胞與組織",description:"混淆細胞、組織、器官與器官系統的層級和功能。",examples:["把肌肉說成細胞","把心臟說成組織"],hint_template:"依照細胞→組織→器官→系統的層級，找出最小功能單位。",mini_lesson_hint:"生物階層分類與功能配對。"},
  {code:"SCI-CON-EARTH",category:"concept",label_zh:"地球系統",description:"混淆地球各圈層、天氣、水循環或地質現象。",examples:["雲是水蒸氣本身","天氣與氣候視為相同"],hint_template:"先判斷研究對象屬於哪個地球系統，再描述能量或物質如何流動。",mini_lesson_hint:"地球系統圈層與水循環概念圖。"},
  {code:"SCI-CAUSAL-REVERSE",category:"causal_reasoning",label_zh:"因果倒置",description:"把原因與結果的方向顛倒。",examples:["植物因被吃掉而缺少養分","先有結果再推錯原因"],hint_template:"把句子改寫成「因為 A，所以 B」，確認箭頭方向。",mini_lesson_hint:"因果箭頭排序與理由配對。"},
  {code:"SCI-CAUSAL-CORRELATION",category:"causal_reasoning",label_zh:"混淆相關與因果",description:"看到兩件事一起發生，就直接宣稱其中一件造成另一件。",examples:["冰淇淋銷售與溺水率同升就互為原因","溫度與高度變化同時出現"],hint_template:"除了共同變化，還要找出可支持因果的機制或操弄證據。",mini_lesson_hint:"相關、因果與第三變因案例比較。"},
  {code:"SCI-CAUSAL-CONTROL",category:"causal_reasoning",label_zh:"控制變因忽略",description:"未保持可能影響結果的條件一致。",examples:["比較植物高度時澆水量也不同","實驗中途更換燈泡"],hint_template:"一次只改變一個條件，其他可能影響結果的條件要保持相同。",mini_lesson_hint:"實驗變因清單與控制變因圈選。"},
  {code:"SCI-CAUSAL-DEPENDENT",category:"causal_reasoning",label_zh:"混淆獨立與相依變因",description:"把實驗中操弄的因素和觀察結果互換。",examples:["把植物高度當成操弄變因","把水量當成結果變因"],hint_template:"確認哪個變因由實驗者改變，哪個變因用來量結果。",mini_lesson_hint:"獨立、相依、控制變因角色卡。"},
  {code:"SCI-METH-GROUPS",category:"experiment",label_zh:"控制組與實驗組",description:"無法辨識或設計實驗組與控制組。",examples:["兩組都施加相同處理","沒有控制組卻宣稱能比較"],hint_template:"實驗組接受待測處理；控制組除了該處理外，其餘條件相同。",mini_lesson_hint:"實驗組／控制組情境分類。"},
  {code:"SCI-METH-MANIPULATE",category:"experiment",label_zh:"變因操作",description:"沒有明確操弄單一獨立變因。",examples:["同時改變水量與光照","沒有依賴變因的測量規劃"],hint_template:"寫下只改變的條件，並說明要觀察或量測什麼。",mini_lesson_hint:"公平測試設計步驟。"},
  {code:"SCI-METH-READING",category:"experiment",label_zh:"數據讀取",description:"讀取實驗數據時忽略估讀、零點或趨勢。",examples:["量筒視線高於液面仍照常讀值","把小數刻度當精確值"],hint_template:"讀刻度時視線與液面最低點保持水平，並記錄估讀值。",mini_lesson_hint:"儀器刻度與估讀互動題。"},
  {code:"SCI-METH-INSTRUMENT",category:"experiment",label_zh:"儀器使用",description:"選錯儀器、單位或量測範圍。",examples:["用天平量液體體積","用大量程量筒只量少量液體"],hint_template:"先確認要測的是長度、體積、質量、時間或溫度，再選儀器。",mini_lesson_hint:"量與儀器配對表。"},
  {code:"SCI-DATA-AXIS",category:"data_interpretation",label_zh:"圖表軸線判讀",description:"未正確判讀橫軸、縱軸、刻度或原點。",examples:["把縱軸數值當成時間","忽略軸線單位"],hint_template:"先讀圖名，再分別確認橫軸、縱軸、單位與刻度間距。",mini_lesson_hint:"四格圖表閱讀檢核表。"},
  {code:"SCI-DATA-EXTRAPOLATE",category:"data_interpretation",label_zh:"趨勢外推",description:"把有限範圍內的趨勢無限制延伸到未測量區域。",examples:["室溫數據直接外推到高溫極限","短期生長趨勢推論永遠成立"],hint_template:"先問資料涵蓋的範圍，沒有證據的區域不要直接延伸。",mini_lesson_hint:"資料範圍與合理外推判讀。"},
  {code:"SCI-DATA-RATIO",category:"data_interpretation",label_zh:"比例誤判",description:"混淆比例、百分比、速率與絕對量。",examples:["增加量相同就說比例相同","把百分比差當成百分點差"],hint_template:"寫出比較的基準量，並確認是在問相差值還是比例。",mini_lesson_hint:"比例與絕對量對照題。"},
  {code:"SCI-DATA-UNIT",category:"data_interpretation",label_zh:"單位換算誤差",description:"單位換算時倍率、方向或詞頭錯誤。",examples:["1 公升誤為 10 毫升","公里與公尺相差1000倍"],hint_template:"先列出已知單位和目標單位，再確認換算倍率方向。",mini_lesson_hint:"單位階梯與詞頭記憶卡。"},
  {code:"SCI-DIAG-MODEL",category:"diagram",label_zh:"模型與實物差異",description:"把科學模型、示意圖或比例模型誤認為完整實物。",examples:["把地球內部剖面當成等比例實物","模型箭頭當成物體真實移動路徑"],hint_template:"先確認圖中哪些是比例、剖面或符號，哪些是實際觀察。",mini_lesson_hint:"模型、示意圖與實物照片比較。"},
  {code:"SCI-DIAG-LEGEND",category:"diagram",label_zh:"符號圖例",description:"未讀懂圖例、符號、顏色、標示或連線。",examples:["把箭頭方向看成相同","忽略圖例中的黑白符號"],hint_template:"讀圖前先對照圖例，確認每個符號和箭頭的意義。",mini_lesson_hint:"圖例閱讀與符號配對。"},
  {code:"SCI-DIAG-FLOW",category:"diagram",label_zh:"流程圖順序",description:"未依箭頭、條件或回饋判斷流程順序。",examples:["水循環跳過凝結步驟","把反應產物放在反應物之前"],hint_template:"沿著箭頭逐步追蹤，檢查每一個輸入、轉換與輸出。",mini_lesson_hint:"流程圖節點排序與回饋辨識。"},
  {code:"SCI-SAFETY-LABEL",category:"safety",label_zh:"試劑標示",description:"未依標示辨識危害、腐蝕性、毒性或防護需求。",examples:["不戴護目鏡處理腐蝕性液體","把危險標籤當成可忽略"],hint_template:"先讀危害標示與處理說明，依規定佩戴防護用品。",mini_lesson_hint:"實驗室標誌與個人防護配對。"},
  {code:"SCI-SAFETY-HOT-PRESSURE",category:"safety",label_zh:"高溫高壓處置",description:"不安全地加熱、密封、加壓或處理熱容器。",examples:["密封容器加熱","剛加熱完直接觸碰玻璃器皿"],hint_template:"加熱或加壓前先確認容器可承受條件，使用防護並讓系統冷卻後再處理。",mini_lesson_hint:"高溫高壓實驗安全情境演練。"}
];
export function lookupScienceErrorCode(code){return SCIENCE_ERROR_TAXONOMY.find(e=>e.code===code)||null;}
export function listScienceErrorsByCategory(category){return SCIENCE_ERROR_TAXONOMY.filter(e=>e.category===category);}
export function listScienceErrorCategories(){return [...new Set(SCIENCE_ERROR_TAXONOMY.map(e=>e.category))];}
export function scienceErrorTaxonomySize(){return SCIENCE_ERROR_TAXONOMY.length;}
export function validateScienceErrorTaxonomy(){const codes=SCIENCE_ERROR_TAXONOMY.map(e=>e.code); return {valid:codes.length===new Set(codes).size && codes.length>=15 && codes.length<=25, code_count:codes.length, categories:listScienceErrorCategories(), errors:codes.length!==new Set(codes).size?['duplicate-codes']:[]};}
