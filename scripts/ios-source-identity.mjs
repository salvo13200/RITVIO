import {spawnSync} from 'node:child_process';

/** Build provenance only; this does not claim provider/device acceptance. */
export function iosSourceIdentity(root){
 const git=(args)=>{const result=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});return result.status===0?result.stdout:null;};
 const commit=git(['rev-parse','HEAD'])?.trim(),tree=git(['rev-parse','HEAD^{tree}'])?.trim();
 const untracked=git(['ls-files','--others','--exclude-standard','-z']);
 const diff=spawnSync('git',['diff','--quiet','HEAD','--'],{cwd:root,windowsHide:true});
 if(!/^[a-f\d]{40}$/.test(commit??'')||!/^[a-f\d]{40}$/.test(tree??'')||untracked===null||![0,1].includes(diff.status))return {commit:null,tree:null,dirty:true};
 return {commit,tree,dirty:diff.status!==0||untracked.length!==0};
}
