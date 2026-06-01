module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-reanimated/plugin',
      // @supabase/supabase-js ships a CJS dist that uses import() to lazily
      // load @opentelemetry/api. Babel leaves import() untouched in CJS
      // (sourceType:'script') context, so the raw expression reaches Hermes,
      // which can't compile it inside a Metro bundle. Replace with
      // Promise.resolve(null) — supabase's own .catch(() => null) handles it.
      function nullifySupabaseDynamicImport({ types: t }) {
        return {
          visitor: {
            CallExpression(path, state) {
              if (path.node.callee.type !== 'Import') return;
              if (!(state.filename ?? '').includes('@supabase')) return;
              path.replaceWith(
                t.callExpression(
                  t.memberExpression(t.identifier('Promise'), t.identifier('resolve')),
                  [t.nullLiteral()]
                )
              );
            },
          },
        };
      },
    ],
  };
};
