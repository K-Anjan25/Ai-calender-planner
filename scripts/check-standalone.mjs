/** Behavior smoke tests for the exact delivered HTML, without a network/CDN. */
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {JSDOM, VirtualConsole} from 'jsdom'
const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message))
const html=await readFile('public/calendra.html','utf8')
assert.ok(!html.includes('<script src='),'Must bundle scripts rather than rely on a CDN')
const dom=new JSDOM(html,{url:'https://calendra.test/calendra.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});w.IntersectionObserver=class {observe(){} disconnect(){} unobserve(){}};w.scrollTo=()=>{};w.HTMLCanvasElement.prototype.getContext=()=>null;w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}}})
const {document,Event}=dom.window
const wait=()=>new Promise(r=>setTimeout(r,80))
await wait();assert.match(document.querySelector('h1').textContent,/Your time is finite/)
const menu=document.querySelector('[aria-controls="navigation-dialog"]');menu.click();await wait();assert.ok(document.querySelector('dialog').hasAttribute('open'))
document.querySelector('a[href="#/contact"]').click();await wait();await wait();assert.match(document.querySelector('h1').textContent,/conversation/);assert.ok(!document.querySelector('dialog').hasAttribute('open'))
const form=document.querySelector('form[aria-label="Contact Calendra"]');form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await wait();assert.equal(form.querySelectorAll('[aria-invalid="true"]').length,4)
for(const [name,value] of [['name','A Test'],['email','test@example.com'],['message','A valid message about planning my week.']]) form.elements.namedItem(name).value=value
form.elements.namedItem('consent').checked=true;form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await wait();assert.match(form.textContent,/couldn’t send/);assert.ok(!form.textContent.includes('Message received'))
dom.window.location.hash='#/pricing';await wait();await wait();assert.equal(document.querySelectorAll('article').length,3)
const q=document.querySelector('[aria-controls="answer-1"]');q.click();await wait();assert.equal(q.getAttribute('aria-expanded'),'true');assert.ok(!document.querySelector('#answer-1').hidden)
assert.deepEqual(errors,[]);dom.window.close();console.log('PASS: inline bundle, four-view routing, menu, validation, honest submission failure, pricing and FAQ behavior.')
