// music.js – модуль для Skulpt
// Used mml-emitter - MML(Music Macro Language) event emitter for Web Audio API, (c) mohayonao (mohayonao.github.io/mml-emitter/)
var $builtinmodule = function(name) {
    var mod = {};
    let playingState = false;
    let mmlEmitter = null;
    let audioContext = new (window.AudioContext || window.webkitAudioContext)();
    var currentInstrument = 0;
function playNote(ev) {
  //var currentInstrument = ev.trackNumber;
  //if  (ev.trackNumber===1) {currentInstrument =3} 
  const partials = [
    [...'1248'],
    [...'1579'],
    [...'123'],
    [...'1']
  ][currentInstrument];

  const t0 = ev.playbackTime;
  const t1 = t0 + ev.duration * (ev.quantize / 100);
  const t2 = t1 + 0.5;
  const volume = 0.25 * (ev.velocity / 128);

  partials.forEach(j => {
    const osc = audioContext.createOscillator();
    const amp = audioContext.createGain();

    // Перетворення символу partial у число
    const harmonic = parseInt(j, 10);

    // Обчислення частоти ноти
    const freq = harmonic * 55 * Math.pow(2, (ev.noteNumber - 33) / 12);
    //console.log("Freq=",freq, ev.noteNumber, ev.trackNumber )
    osc.frequency.setValueAtTime(freq, t0);
    osc.type = 'sine';

    // Початкова гучність
    const gainValue = volume  / (1 + Math.log2(harmonic));
    amp.gain.setValueAtTime(0, audioContext.currentTime); // без клацання
    amp.gain.setValueAtTime(gainValue, t0);
    amp.gain.linearRampToValueAtTime(0, t1); // плавне загасання

    osc.connect(amp).connect(audioContext.destination);
    osc.detune.setValueAtTime(+12, t0);
    osc.detune.linearRampToValueAtTime(+1, t1);
    osc.start(t0);
    osc.stop(t2);
  });
}
//
    function playMML(mml) {
        let MMLEmitter = window.MMLEmitter; // бібліотека вже підключена
        var config = { context: audioContext };
        let mmlString = mml.toLowerCase();
        mmlEmitter = new MMLEmitter(mmlString, config);
        playingState = true;
        mmlEmitter.on("note", function(e) {
          //console.log("NOTE: " + JSON.stringify(e));
          playNote(e);
        });
        mmlEmitter.on("end:all", function(e) {
          //console.log("END : " + JSON.stringify(e));
          mmlEmitter.stop();
          playingState = false;
        });
    
        mmlEmitter.start();
    }

    var instrument = function(i){ 
            Sk.builtin.pyCheckArgs("instrument", arguments, 1, 1);
            currentInstrument = Sk.ffi.remapToJs(i);            
            return Sk.builtin.none.none$;
    }   
    mod.instrument = new Sk.builtin.func(instrument);
//
    function preprocessMML(input) {
      // 1. Вилучити "MML@" на початку
      if (input.startsWith("MML@")) {
        input = input.slice(4);
      }
    
      // 2. Перевести всі символи у нижній регістр
      input = input.toLowerCase();
    
      // 3. Заміна "#" на "+"
      input = input.replace(/#/g, '+');
    
      // 4. Заміна "," на ";"
      input = input.replace(/,/g, ';');
    
      // 5. Заміна "&" на "^" лише для однакових нот
      input = input.replace(/([a-g][+-]?(?:\d*\.?)(&[a-g][+-]?(?:\d*\.?))+)/g, (match) => {
        const parts = match.split('&');
      const baseNote = parts[0].match(/^([a-g][+-]?)/)[1];
      for (const p of parts.slice(1)) {
          const n = p.match(/^([a-g][+-]?)/);
          if (!n || n[1] !== baseNote) {
              throw new Error(`Помилка: '&' між різними нотами: '${match}'`);
          }
      }
      return parts.map((p, i) => (i === 0 ? p : `^${p}`)).join('');
     });

    
      // 5.1 Перевірка на заборонені випадки "&" (різні ноти)
      const badTies = input.match(/([a-g][+-]?\d*\.?)&([a-g][+-]?\d*\.?)/g);
      if (badTies) {
        for (const match of badTies) {
          const [note1, note2] = match.split('&');
          if (note1.replace(/\d|\./g, '') !== note2.replace(/\d|\./g, '')) {
            throw new Error(`Помилка: неможливо з'єднати різні ноти '${note1}' і '${note2}' через '&'`);
          }
        }
      }
    
      // 6. Заміна "nNN" на відповідну ноту і відновлення попередньої октави
      // MML: n60 = c5, n61 = c+5, n62 = d5, ..., n72 = c6
      // Спочатку фіксуємо поточну октаву
      let result = '';
      let octave = 4;  // стандартна початкова октава
      let lastOctave = octave;
      let i = 0;
    
      while (i < input.length) {
        const ch = input[i];
    
        if (ch === 'o') {
          const match = input.slice(i).match(/^o(\d+)/);
          if (match) {
            lastOctave = parseInt(match[1]);
            result += match[0];
            i += match[0].length;
            continue;
          }
        }
    
        if (input[i] === 'n') {
          const match = input.slice(i).match(/^n(\d+)/);
          if (match) {
            const midi = parseInt(match[1]);
            const noteNames = ['c', 'c+', 'd', 'd+', 'e', 'f', 'f+', 'g', 'g+', 'a', 'a+', 'b'];
            const note = noteNames[midi % 12];
            const oct = Math.floor(midi / 12) - 1;
    
            result += `o${oct}${note}o${lastOctave}`;
            i += match[0].length;
            continue;
          }
        }
    
        result += ch;
        i++;
      }
    
      return result;
    }
    
//
    var play = function(mml){ 
            Sk.builtin.pyCheckArgs("play", arguments, 1, 1);
            let mmlStr = preprocessMML(Sk.ffi.remapToJs(mml));
            console.log("MML=",mmlStr)
            playMML(mmlStr);
            return Sk.builtin.none.none$;
    }   
    mod.play = new Sk.builtin.func(play);
    
    var stop_playing = function() {
            if (mmlEmitter) {
                mmlEmitter.stop();
                playingState = false;
            }
            return Sk.builtin.none.none$;
    }
    mod.stop_playing = new Sk.builtin.func(stop_playing);
    
    var playing = function() {
            return new Sk.builtin.bool(playingState);
    }
    mod.playing = new Sk.builtin.func(playing);
    mod.SERENADE = Sk.ffi.remapToPy(`
    t105 l8 o5 q75 v100
    /: ab-> c4c4c4 c4.faf fedc<b-4 [gb-]2 [fa]4 agb-a>c<b- >c+dc<b-ag f2[ea]g f4r4 :/
    /: [fa][eg] [eg]2[gb-][fa] [fa]2>c<b b>dfd<b>d c4.<b-
    ab-> c4c4c4 c4.faf fedc<b-4 [gb-]2 [fa]4 agb-a>c<b- >c+dc<b-ag f2[ea]g f4r4 :/
   ;
   t105 l8 o4 q75 v75
   /: r4 f>c<a>c<a>c< f>c<a>c<a>c< g>c<b->c<b->c< [e>c]2 [f>c]4 [b->d]2.^2 [<b->b-]4 [ca]2[cb-]4 [fa]4 <f4> :/
   /: r4 c4>c4r4< c4>c4r4< [cdf]4[cdf]4[cdf]4 [ce]4r4
   r4 f>c<a>c<a>c< f>c<a>c<a>c< g>c<b->c<b->c< [e>c]2 [f>c]4 [b->d]2.^2 [<b->b-]4 [ca]2[cb-]4 [fa]4 <f4> :/
   ;`);
   mod.MARCH = Sk.ffi.remapToPy(`
   t120 q50 v100
    /: o4 l16 bag+a>
   c8r8dc<b>c e8r8fed+e bag+abag+a >c4<a8>c8<
   l8 [gb][f+a][eg][f+a] [gb][f+a][eg][f+a] [gb][f+a][eg][d+f+] e4 :/
    /: o5 [ce][df] [eg][eg]a16g16f16e16 [<b>d]4[ce][df] [eg][eg]a16g16f16e16 [<b>d]4[<a>c][<b>d]
   [ce][ce] f16e16d16c16 <[g+b]4[a>c][b>d] >[ce][ce]f16e16d16c16 <[g+b]4
   l16 bag+a >c8r8dc<b>c e8r8fed+e bag+abag+a l8>c4<ab >c<bag+ aefd c4<b8.a32b32 a4 :/
    ;
    t120 q50 v80
    /: o3 l8 r4
   a>[ce][ce][ce]< a>[ce][ce][ce]< a>[ce]<a>[ce]< a>[ce][ce][ce]<
   e[b>e][b>e][b>e] e[b>e][b>e][b>e] e[b>e]<b>b e4 :/
    /: o3 r4 c>c<e>e<g>g<r4 c>c<e>e<g4r4 <a>ac>c<e>e<r4 <a>ac>c<e4r4
   a>[ce][ce][ce]< a>[ce][ce][ce]< a>[ce]<a>[ce]< f[a>d+][a>d+][a>d+]
   e[ae]d[fb] c[ea]d[fb] [ea][ea][eg+][eg+] [<a>a]4 :/
   ;`);
    mod.FURELISE = Sk.ffi.remapToPy(`
    t70l4o4rl16>ed+ed+ec-dc<a8rceab8reg+bb+8re>ed+ed+ec-dc<a8rceab8reb+ba8rb>cde8.<g>fed8.<f>edc8.<e>dc<b8re>er8e>er8<d+er8d+
    ed+ed+ec-dc<a8rceab8reg+bb+8re>ed+ed+ec-dc<a8rceab8reb+ba8rb>cde8.<g>fed8.<f>edc8.<e>dc<b8re>er8e>er8<d+er8d+ed+ed+ec-dc<a8;
    t70l4o3r2.l16o2a>ear8.<e>eg+r8.<a>ear2r<a>ear8.<e>eg+r8.<a>ear8.cgb+r8.<g>gbr8.<a>ear8.<e>e>er8e>er8d+er8d+er2ro2a>ear8.<e>eg+
    r8.<a>ear2r<a>ear8.<e>eg+r8.<a>
    ;`);
    mod.TWINKLE = Sk.ffi.remapToPy("T100L8\nCCGGAAG4\nFFEEDDC4\nGGFFEED4\nGGFFEED4\nCCGGAAG4\nFFEEDDC4");
	mod.YEE = Sk.ffi.remapToPy("T120L12\nCD6C\nE4E4D6C4D3G6G4DE6D\nF4F4G6A6P\nB4");
	mod.LITTLEBEE =Sk.ffi.remapToPy("T100L8\nGEE4FDD4\nCDEFGGG4\nGEE4FDD4\nCEGGE2\nDDDDDEF4\nEEEEEFG4\nGEE4FDD4\nCEGGC2");			
	return mod;
};
