#!/usr/bin/env python3
"""Generate a clearly labelled simulated interview using the configured MiniMax key.
Run only on the trusted server; credentials and outputs never appear in logs.
"""
import argparse,json,pathlib,urllib.request,subprocess,yaml
p=argparse.ArgumentParser()
p.add_argument('--credentials',required=True);p.add_argument('--text',required=True);p.add_argument('--output',required=True)
a=p.parse_args()
refs=yaml.safe_load(pathlib.Path(a.credentials).read_text())['refs']
text=pathlib.Path(a.text).read_text()
body={'model':'speech-2.8-hd','text':text,'stream':False,'voice_setting':{'voice_id':'male-qn-qingse','speed':1,'vol':1,'pitch':0},'audio_setting':{'sample_rate':16000,'format':'mp3','channel':1}}
req=urllib.request.Request('https://api.minimaxi.com/v1/t2a_v2',data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+refs['MINIMAX_CUSTOM_API_KEY'],'Content-Type':'application/json'})
with urllib.request.urlopen(req,timeout=120) as response: result=json.load(response)
if result.get('base_resp',{}).get('status_code')!=0 or not result.get('data',{}).get('audio'): raise RuntimeError('TTS did not produce audio')
output=pathlib.Path(a.output);output.parent.mkdir(parents=True,exist_ok=True)
mp3=output.with_suffix('.mp3');mp3.write_bytes(bytes.fromhex(result['data']['audio']))
subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-i',str(mp3),'-ar','16000','-ac','1',str(output)],check=True)
print(json.dumps({'model':body['model'],'bytes':output.stat().st_size,'label':'演示模拟数据 / AI 合成语音'},ensure_ascii=False))
