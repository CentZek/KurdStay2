import { test, expect, Page } from '@playwright/test'
import en from '../../src/i18n/en'
import ar from '../../src/i18n/ar'
import ckb from '../../src/i18n/ckb'
import kmr from '../../src/i18n/kmr'

const date=(offset:number)=>new Date(Date.now()+offset*86400000).toISOString().slice(0,10)
const trip={city:'Duhok',checkIn:date(30),checkOut:date(32),guests:4,rooms:2,propertyType:'farm',maxTotal:600,currency:'USD',amenities:['Pool']}
const stays=[1,2,3].map(i=>({id:`10000000-0000-0000-0000-00000000000${i}`,roomId:`20000000-0000-0000-0000-00000000000${i}`,name:`Mountain Farm ${i}`,city:'Duhok',image:null,roomName:'Family suite',total:400+i*20,currency:'USD',nights:2,guests:4,rooms:2,checkIn:trip.checkIn,checkOut:trip.checkOut,amenities:['Pool']}))
async function setup(page:Page,options:{lang?:string;fail?:boolean;count?:number;delay?:boolean}={}) {
  const state={turns:[] as any[],saved:[] as any[],searches:[] as any[],handoffs:0,agent:false,release:null as null|(()=>void)}
  await page.addInitScript(lang=>localStorage.setItem('language',lang),options.lang||'en')
  await page.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|images\.pexels\.com)\//,r=>r.abort())
  await page.route('https://booking.test/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname
    let data:any=[]
    if(path.endsWith('/current_profile'))data=null
    if(path.endsWith('/chat_stay_catalog'))data={cities:['Duhok','Erbil'],amenities:['Pool']}
    if(path.endsWith('/chat_sessions') && req.method()==='POST')data={id:'30000000-0000-0000-0000-000000000001'}
    if(path.endsWith('/chat_messages')) {
      if(req.method()==='POST'){state.saved.push(req.postDataJSON());data=null}
      else data=state.agent?[{id:'40000000-0000-0000-0000-000000000001',content:'A team member is here to help.'}]:[]
    }
    if(path.endsWith('/request_chat_agent')){state.handoffs++;data=null}
    if(path.endsWith('/find_chat_stays')){state.searches.push(req.postDataJSON());data=stays.slice(0,options.count??3)}
    if(path.endsWith('/chatbot')) {
      state.turns.push(req.postDataJSON())
      if(options.delay)await new Promise<void>(resolve=>{state.release=resolve})
      if(options.fail && state.turns.length===1)return route.fulfill({status:503,json:{error:'ASSISTANT_UNAVAILABLE'}})
      data=state.turns.length===1 && !options.fail
        ? {reply:'Which dates and how many guests?',criteria:{...trip,checkIn:null,checkOut:null,guests:null},suggestions:['Four guests, two nights'],recommendations:[]}
        : {reply:options.count===0?en.assistant.noMatches:'These stays match your trip.',criteria:trip,searched:true,recommendations:stays.slice(0,options.count??3),suggestions:['Change my dates']}
    }
    return route.fulfill({json:data})
  })
  await page.goto('/')
  await page.locator('.chat-launcher').click()
  return state
}

test('conversation remembers answers and renders three verified booking links with dates and rooms',async({page})=>{
  const state=await setup(page)
  const chat=page.getByRole('dialog')
  await chat.getByRole('textbox').fill('Find a farm with a pool in Duhok')
  await chat.getByRole('button',{name:en.assistant.send,exact:true}).click()
  await expect(chat.getByText('Which dates and how many guests?',{exact:true})).toBeVisible()
  await chat.getByRole('button',{name:'Four guests, two nights',exact:true}).click()
  await expect(chat.locator('.chat-stay-card')).toHaveCount(3)
  expect(state.turns[1].messages).toHaveLength(3)
  expect(state.turns[1].criteria.amenities).toEqual(['Pool'])
  const link=chat.getByRole('link',{name:en.assistant.bookStay}).first()
  const href=new URL(await link.getAttribute('href')||'','https://kurdstay.com')
  expect(Object.fromEntries(href.searchParams)).toMatchObject({checkIn:trip.checkIn,checkOut:trip.checkOut,guests:'4',rooms:'2',room:stays[0].roomId})
  await chat.screenshot({path:'tmp/chat-results-desktop.png'})
  await link.click()
  await expect(page).toHaveURL(new RegExp(`/hotel/${stays[0].id}\\?`))
  await expect(chat).toHaveCount(0)
})

for(const [lang,t] of Object.entries({en,ar,ckb,kmr})) {
  test(`direct trip search works without AI and fits a small phone (${lang})`,async({page})=>{
    await page.setViewportSize({width:320,height:740})
    const state=await setup(page,{lang,count:2})
    const chat=page.getByRole('dialog')
    await chat.getByRole('button',{name:t.assistant.chooseDates,exact:true}).click()
    const form=chat.locator('.chat-trip-form')
    await form.getByLabel(t.common.location,{exact:true}).selectOption('Duhok')
    await form.getByLabel(t.common.checkIn,{exact:true}).fill(trip.checkIn)
    await form.getByLabel(t.common.checkOut,{exact:true}).fill(trip.checkOut)
    await form.getByLabel(t.common.guests,{exact:true}).fill('4')
    await form.getByLabel(t.common.rooms,{exact:true}).fill('2')
    await chat.screenshot({path:`tmp/chat-trip-${lang}.png`})
    expect(await chat.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true)
    await form.getByRole('button',{name:t.assistant.findStays,exact:true}).click()
    await expect(chat.locator('.chat-stay-card')).toHaveCount(2)
    expect(state.turns).toHaveLength(0)
    expect(state.searches[0]).toMatchObject({p_city:'Duhok',p_check_in:trip.checkIn,p_check_out:trip.checkOut,p_guests:4,p_rooms:2})
    await chat.screenshot({path:`tmp/chat-results-${lang}.png`})
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    expect(await chat.locator('.chat-stay-info').first().innerText()).not.toContain('booking.rooms')
  })
}

test('failed AI turns can retry without duplicate messages and zero matches never invent listings',async({page})=>{
  const state=await setup(page,{fail:true,count:0})
  const chat=page.getByRole('dialog')
  await chat.getByRole('textbox').fill('Find my stay')
  await chat.getByRole('button',{name:en.assistant.send,exact:true}).click()
  await expect(chat.getByRole('alert')).toBeVisible()
  await chat.getByRole('button',{name:en.assistant.retry,exact:true}).click()
  await expect(chat.getByText(en.assistant.noMatches,{exact:true})).toBeVisible()
  expect(state.saved.filter(m=>m.role==='customer').map(m=>m.id)).toEqual([state.saved[0].id,state.saved[0].id])
  await expect(chat.locator('.chat-turn-user')).toHaveCount(1)
  await expect(chat.locator('.chat-stay-card')).toHaveCount(0)
  await expect(chat.getByRole('alert')).toHaveCount(0)
})

test('human requests stay queued until a staff reply; queued messages do not invoke AI',async({page})=>{
  const state=await setup(page)
  const chat=page.getByRole('dialog')
  await chat.getByRole('button',{name:en.chatbot.talkToAgent,exact:true}).click()
  await expect(chat.getByText(en.assistant.agentWaiting,{exact:true})).toBeVisible()
  expect(state.handoffs).toBe(1)
  await chat.getByRole('textbox').fill('Please help with my booking')
  await chat.getByRole('button',{name:en.assistant.send,exact:true}).click()
  await expect(chat.getByRole('textbox')).toBeEnabled()
  expect(state.turns).toHaveLength(0)
  state.agent=true
  await expect(chat.locator('.chat-turn-agent').filter({hasText:'A team member is here to help.'})).toBeVisible({timeout:7000})
  await expect(chat.getByText(en.chatbot.connectedToAgent,{exact:true})).toBeVisible()
})

test('starting a new conversation discards a late response',async({page})=>{
  const state=await setup(page,{delay:true})
  const chat=page.getByRole('dialog')
  await chat.getByRole('textbox').fill('Old request')
  await chat.getByRole('button',{name:en.assistant.send,exact:true}).click()
  await expect.poll(()=>state.turns.length).toBe(1)
  await chat.getByRole('button',{name:en.chatbot.newConversation,exact:true}).click()
  state.release?.()
  await expect(chat.getByText(en.assistant.welcome,{exact:true})).toBeVisible()
  await expect(chat.getByText('Which dates and how many guests?',{exact:true})).toHaveCount(0)
})
