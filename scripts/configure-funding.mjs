import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function fundingLinks(paypal,coffee){
  const validate=(input,hosts)=>{
    const url=new URL(input);
    if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!hosts.includes(url.hostname))throw Error('Use an HTTPS link on the payment provider’s own domain.');
    return url;
  };
  const pp=validate(paypal,['paypal.me','www.paypal.me','paypal.com','www.paypal.com']);
  if(pp.hostname.endsWith('paypal.me')){if(!/^\/[a-zA-Z0-9]+\/?$/.test(pp.pathname)||pp.search)throw Error('Use your PayPal.Me profile URL, without an amount.');}
  else if(pp.pathname!=='/donate'||![...pp.searchParams.keys()].every(key=>key==='hosted_button_id')||!/^\w+$/.test(pp.searchParams.get('hosted_button_id')??''))throw Error('Use a PayPal.Me profile or a hosted PayPal Donate link.');
  const bc=validate(coffee,['buymeacoffee.com','www.buymeacoffee.com']);
  if(!/^\/[a-zA-Z0-9_]+\/?$/.test(bc.pathname)||bc.search)throw Error('Use your Buy Me a Coffee profile URL.');
  return {paypal:pp.href,coffee:bc.href,username:bc.pathname.split('/')[1]};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),values={};
  for(let index=0;index<args.length;index+=2){if(!['--paypal','--coffee'].includes(args[index])||!args[index+1])throw Error('Usage: pnpm funding:configure --paypal HTTPS_URL --coffee HTTPS_URL');values[args[index]]=args[index+1];}
  const links=fundingLinks(values['--paypal'],values['--coffee']);
  const root=path.resolve(import.meta.dirname,'..');
  const readme=await readFile(path.join(root,'README.md'),'utf8');
  const body=`Donations are optional and do not unlock features.\n\n[Support via PayPal](${links.paypal}) · [Buy Me a Coffee](${links.coffee})\n\nPayments are handled by the provider; provider fees may apply.`;
  if(!readme.includes('<!-- funding:start -->')||!readme.includes('<!-- funding:end -->'))throw Error('README funding markers are missing.');
  await writeFile(path.join(root,'.github/FUNDING.yml'),`# Voluntary support for RITVIO development.\nbuy_me_a_coffee: ${JSON.stringify(links.username)}\ncustom: [${JSON.stringify(links.paypal)}]\n`);
  await writeFile(path.join(root,'README.md'),readme.replace(/<!-- funding:start -->[\s\S]*?<!-- funding:end -->/,`<!-- funding:start -->\n${body}\n<!-- funding:end -->`));
  await writeFile(path.join(root,'README.en.md'),await readFile(path.join(root,'README.md'),'utf8'));
  console.log('GitHub funding links and README updated. Review both destinations before publishing.');
}
