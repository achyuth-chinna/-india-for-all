export const lifetimeRows=[
 ['Birth-related medical care',10000,100000,'One-time assumption'],
 ['School education',2863*14,25002*14,'14 years; 2025 survey averages held constant'],
 ['College education',30000*3,150000*4,'3 × ₹30,000 / 4 × ₹1,50,000; assumptions'],
 ['Routine healthcare: ages 0–17',18*2000,18*6000,'18 × ₹2,000 / ₹6,000; assumptions'],
 ['Routine healthcare: ages 18–59',42*5000,42*15000,'42 × ₹5,000 / ₹15,000; assumptions'],
 ['Routine healthcare: ages 60–79',20*15000,20*60000,'20 × ₹15,000 / ₹60,000; assumptions'],
 ['Separate major-treatment provision',50000,500000,'One-time assumption; excludes routine care']
];
export const lifetimeTotals=[1,2].map(i=>lifetimeRows.reduce((n,r)=>n+r[i],0));
export function ordinaryTax(income,salaried=true){
 let taxable=Math.max(0,income-(salaried?75000:0)),tax=0;
 const bands=[[400000,0],[400000,.05],[400000,.10],[400000,.15],[400000,.20],[400000,.25],[Infinity,.30]];
 let remaining=taxable;for(const[width,rate]of bands){const used=Math.min(remaining,width);tax+=used*rate;remaining-=used;if(remaining<=0)break}
 if(taxable<=1200000)tax=0;else tax=Math.min(tax,taxable-1200000);
 return Math.round(tax*1.04);
}
export const salaryExamples=[300000,600000,1200000,1275000,1800000,2400000,3000000].map(n=>[n,ordinaryTax(n)]);
export const gstInPrice=(price,rate)=>price*rate/(100+rate);

import assert from 'node:assert/strict';
assert.deepEqual(lifetimeTotals,[736082,3488028]);
assert.deepEqual(salaryExamples.map(x=>x[1]),[0,0,0,0,150800,292500,475800]);
assert.equal(ordinaryTax(1285000),10400);
assert.equal(gstInPrice(1180,18),180);
console.log('Passed fixed lifetime, salary tax, marginal relief and GST arithmetic.');
