import assert from 'node:assert/strict';
import fs from 'node:fs';
import Rubberband from '../vendor/rubberband/rubberband.js';
import {transpose, encodeWav} from '../src/dsp.mjs';
const m = await Rubberband({wasmBinary:fs.readFileSync(new URL('../vendor/rubberband/rubberband.wasm', import.meta.url)), print:()=>{}, printErr:()=>{}});
const sr=48000, n=sr*2;
const sine = (freq, length=n) => Float32Array.from({length}, (_,i) => .2 * Math.sin(2*Math.PI*freq*i/sr));
function spectrum(data) {
  const N=32768, re=new Float64Array(N), im=new Float64Array(N);
  for(let i=0;i<N;i++) re[i]=data[sr/2+i]*(.5-.5*Math.cos(2*Math.PI*i/(N-1)));
  for(let i=1,j=0;i<N;i++){let bit=N>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)[re[i],re[j]]=[re[j],re[i]];}
  for(let len=2;len<=N;len*=2){const angle=-2*Math.PI/len,wr0=Math.cos(angle),wi0=Math.sin(angle);for(let i=0;i<N;i+=len){let wr=1,wi=0;for(let j=0;j<len/2;j++){const u=i+j,v=u+len/2,tr=re[v]*wr-im[v]*wi,ti=re[v]*wi+im[v]*wr;re[v]=re[u]-tr;im[v]=im[u]-ti;re[u]+=tr;im[u]+=ti;const next=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=next;}}}
  return Float64Array.from({length:N/2},(_,i)=>re[i]*re[i]+im[i]*im[i]);
}
function frequency(data) {
  const power=spectrum(data),N=power.length*2;
  const energy=i=>Math.log(power[i]+1e-30);
  let bin=1;for(let i=2;i<N/2;i++)if(energy(i)>energy(bin))bin=i;
  const correction=.5*(energy(bin-1)-energy(bin+1))/(energy(bin-1)-2*energy(bin)+energy(bin+1));
  return (bin+correction)*sr/N;
}
const results=[];
for(const shift of [-12,-2,2,12]) {
  const output=transpose(m,[sine(440),sine(660)],sr,shift);
  for(let c=0;c<2;c++) {
    assert.equal(output[c].length,n);
    const measured=frequency(output[c]), expected=(c?660:440)*2**(shift/12);
    assert.ok(Math.abs(measured-expected)<expected*.003,`pitch ${shift} channel ${c}: ${measured} vs ${expected}`);
    results.push({shift,channel:c,expectedHz:+expected.toFixed(2),measuredHz:+measured.toFixed(2),durationSeconds:output[c].length/sr});
  }
}
const input=sine(440);assert.deepEqual(transpose(m,[input],sr,0)[0],input);
for(const length of [1,101,1024,5001]) assert.equal(transpose(m,[sine(440,length)],sr,2)[0].length,length);
// Harmonic vowel with stationary spectral peaks at 700 and 1700 Hz.
const base=100, vowel=new Float32Array(n);
for(let harmonic=1;harmonic<=40;harmonic++) {
  const f=base*harmonic, amp=.035*(Math.exp(-.5*((f-700)/120)**2)+.6*Math.exp(-.5*((f-1700)/170)**2));
  for(let i=0;i<n;i++) vowel[i]+=amp*Math.sin(2*Math.PI*f*i/sr);
}
function strongestHarmonic(data, f0, lower, upper) {
  let best={hz:0,energy:0};
  const power=spectrum(data), resolution=sr/(power.length*2);
  for(let h=Math.ceil(lower/f0); h*f0<=upper; h++) {
    const f=h*f0;let energy=0;
    for(let bin=Math.ceil((f-25)/resolution);bin*resolution<f+25;bin++)energy+=power[bin];
    if(energy>best.energy)best={hz:f,energy};
  }
  return best.hz;
}
const factor=2**(4/12), withFormants=transpose(m,[vowel],sr,4), withoutFormants=transpose(m,[vowel],sr,4,()=>{},false);
const preservedPeak=strongestHarmonic(withFormants[0],base*factor,400,1100), shiftedPeak=strongestHarmonic(withoutFormants[0],base*factor,400,1100);
assert.ok(Math.abs(preservedPeak-700)<Math.abs(shiftedPeak-700),`formant envelope: ${preservedPeak} preserved, ${shiftedPeak} uncorrected`);
const wav=encodeWav([input,sine(660)],sr), view=new DataView(wav);
assert.equal(view.getUint16(22,true),2);assert.equal(view.getUint16(34,true),24);assert.equal(view.getUint32(24,true),sr);assert.equal(view.getUint32(40,true),n*2*3);
const oddWav=encodeWav([new Float32Array([.5])],sr),oddView=new DataView(oddWav);
assert.equal(oddWav.byteLength,48);assert.equal(oddView.getUint32(4,true),40);assert.equal(oddView.getUint32(40,true),3);
assert.throws(()=>transpose(m,[input],sr,NaN));
assert.throws(()=>transpose(m,[],sr,0), /请选择/);
assert.throws(()=>transpose(m,[input,new Float32Array(10)],sr,0), /不完整/);
assert.throws(()=>transpose(m,[new Float32Array([NaN])],sr,0), /无效/);
assert.throws(()=>encodeWav([input],0), /采样率/);
console.log(JSON.stringify({passed:true,pitchTests:results,zeroSemitone:'exact PCM copy',shortClips:'1, 101, 1024, 5001 samples retained',formantTest:{inputPeakHz:700,preservedPeakHz:Math.round(preservedPeak),ordinaryShiftPeakHz:Math.round(shiftedPeak)},wav:'24-bit stereo, correct headers'},null,2));
