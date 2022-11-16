import axios from 'axios';
import { fromUint8Array, toUint8Array } from 'js-base64';
import debounce from 'lodash.debounce';
import * as monaco from 'monaco-editor';
import { useCallback, useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import { MonacoBinding } from 'y-monaco';
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

  const debouncedUpdate = useCallback(debounce(() => {
    const toPush = updates;
    updates = [];
    axios.post('http://localhost:8000/docupdate2', { updates: toPush, origin: ydocument.clientID }, {
      headers: {
        'Content-Type': 'application/json'
      }
    }).then(() => { }).catch((err) => { });
  }, 500), []);

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
    const socket = io("ws://localhost:8001");
    socket.on('updates', (update, origin) => {
      console.log(update.origin, ydocument.clientID);
      if (update.origin === ydocument.clientID) {
        console.log('not applying update');
        return;
      }
      Y.applyUpdate(ydocument, toUint8Array(update.update));
    });
    ydocument.on('update', (update) => {
      console.log(update);
      const base64encoded = fromUint8Array(Y.encodeStateAsUpdate(ydocument, content));
      updates.push(base64encoded);
      debouncedUpdate();
      // axios.post('http://localhost:8000/docupdate', { update: base64encoded, origin: ydocument.clientID }, {
      //   headers: {
      //     'Content-Type': 'application/json'
      //   }
      // }).then(() => { }).catch((err) => { });
    });
    const model = monaco.editor.createModel('', 'text');
    const editor = monaco.editor.create(node.current, {});
    editor.setModel(model);
    const text = ydocument.getText('monaco');
    const monacoBinding = new MonacoBinding(text, editor.getModel(), new Set([editor]), undefined);
    return () => {
      editor.dispose();
      socket.disconnect();
      monacoBinding.destroy();
    };
  }, [contentLoaded]);

  return <div ref={node} style={{ width: '100vw', height: '100vh' }} />
}