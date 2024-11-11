import {useBrowserAssetsManifest} from '@quilted/quilt/server';

function Skeleton() {
  const manifest = useBrowserAssetsManifest();

//   console.log(manifest.)

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: INLINE_STYLE}} />
      <div id="skeleton">
        <div>Loading skeleton goes here...</div>
      </div>
    </>
  );
}
