import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Copy, Minus, Square, X } from 'lucide-react';
import { desktop } from '../api';

const customFrame = desktop && /Win/.test(navigator.platform);

export default function WindowTitlebar({children,onError}:{children:React.ReactNode;onError:(message:string)=>void}) {
  const [maximized,setMaximized]=useState(false);
  useEffect(()=>{
    if(!customFrame)return;
    const appWindow=getCurrentWindow();
    let active=true,unlisten:(()=>void)|undefined;
    const update=()=>{void appWindow.isMaximized().then(value=>{if(active)setMaximized(value)}).catch(error=>{if(active)onError(String(error))})};
    update();
    void appWindow.onResized(update).then(off=>{if(active)unlisten=off;else off()}).catch(error=>{if(active)onError(String(error))});
    return ()=>{active=false;unlisten?.()};
  },[onError]);
  function control(action:'minimize'|'toggleMaximize'|'close') {
    void getCurrentWindow()[action]().catch(error=>onError(`Window action failed: ${error}`));
  }
  return <header className={`titlebar${customFrame?' custom-titlebar':''}`} data-tauri-drag-region={customFrame||undefined}>
    {children}
    {customFrame&&<div className="window-controls" role="group" aria-label="Window controls">
      <button aria-label="Minimize window" title="Minimize" onClick={()=>control('minimize')}><Minus size={15}/></button>
      <button aria-label={maximized?'Restore window':'Maximize window'} title={maximized?'Restore':'Maximize'} onClick={()=>control('toggleMaximize')}>{maximized?<Copy size={13}/>:<Square size={13}/>}</button>
      <button className="window-close" aria-label="Close window" title="Close" onClick={()=>control('close')}><X size={16}/></button>
    </div>}
  </header>;
}
