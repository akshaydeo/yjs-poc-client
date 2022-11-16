import axios from 'axios';
import { fromUint8Array, toUint8Array } from 'js-base64';
import debounce from 'lodash.debounce';
import * as monaco from 'monaco-editor';
import { useCallback, useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import { MonacoBinding } from 'y-monaco';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';
import './App.css';


let updates = [];

export default function App() {
  const node = useRef(undefined);
  const [contentLoaded, setContentLoaded] = useState(false);
  const [content, setContent] = useState('');
  const [contentVector, setContentVector] = useState(undefined);
  const [update, setUpdate] = useState(undefined);
  const ydocument = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(ydocument);
  const debouncedUpdate = useCallback(debounce(() => {
    const toPush = updates;
    updates = [];
    let size = 0;
    toPush.forEach(u => {
      size += u.length;
    });
    console.log(size);    
    axios.post('http://localhost:8000/docupdate2', { updates: toPush, origin: ydocument.clientID }, {
      headers: {
        'Content-Type': 'application/json'
      }
    }).then(() => { }).catch((err) => { });
  }, 500, { maxWait: 1000 }), []);

  useEffect(() => {
    if (contentLoaded) return;
    axios.get('http://localhost:8000/doc').then((resp) => {
      setContent(resp.data.state);
      setUpdate(toUint8Array(resp.data.update));
      setContentVector(toUint8Array(resp.data.vector));
      setContentLoaded(true);
    })
  }, [contentLoaded]);

  useEffect(() => {
    if (!contentLoaded) return;
    console.log('here', contentVector);
    try {
      Y.applyUpdate(ydocument, update);
    } catch (err) {
      console.log(err);
    }
    // awareness.on('update', ({ added, updated, removed }) => {
    //   const changedClients = added.concat(updated).concat(removed);
    //   const base64encoded = fromUint8Array(awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients));
    //   axios.post('http://localhost:8000/awareness', { update: base64encoded }, {
    //     headers: {
    //       'Content-Type': 'application/json'
    //     }
    //   }).then(() => { }).catch((err) => { });
    // });
    awareness.setLocalStateField('user', {
      // Define a print name that should be displayed
      name: 'Akshay deo',
      // Define a color that should be associated to the user:
      color: '#ffb61e' // should be a hex color
    })
    const socket = io("ws://localhost:8001");
    socket.on('updates', (update) => {
      // console.log(update.origin, ydocument.clientID);
      if (update.origin === ydocument.clientID) {
        // console.log('not applying update');
        return;
      }
      Y.applyUpdate(ydocument, toUint8Array(update.update));
    });
    socket.on('awareness', (update) => {
      awarenessProtocol.applyAwarenessUpdate(awareness, toUint8Array(update.update));
    });
    
    const model = monaco.editor.createModel('', 'text');
    const editor = monaco.editor.create(node.current, {});
    editor.setModel(model);
    const text = ydocument.getText('monaco');
    const monacoBinding = new MonacoBinding(text, editor.getModel(), new Set([editor]), awareness);
    return () => {
      editor.dispose();
      socket.disconnect();
      monacoBinding.destroy();
    };
  }, [contentLoaded]);

  useEffect(()=>{
    ydocument.on('update', (update) => {
      // console.log(update);
      const base64encoded = fromUint8Array(update);
      updates.push(base64encoded);
      debouncedUpdate();
      // axios.post('http://localhost:8000/docupdate', { update: base64encoded, origin: ydocument.clientID }, {
      //   headers: {
      //     'Content-Type': 'application/json'
      //   }
      // }).then(() => { }).catch((err) => { });
    });
  },[contentVector,ydocument]);

  return <div ref={node} style={{ width: '100vw', height: '100vh' }} />
}