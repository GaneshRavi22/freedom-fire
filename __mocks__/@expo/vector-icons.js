const React = require('react');
const { View } = require('react-native');

function createIconMock(displayName) {
  function Icon(props) {
    return React.createElement(View, {
      testID: `icon-${props.name ?? 'unknown'}`,
      ...props,
    });
  }
  Icon.displayName = displayName;
  return Icon;
}

const Ionicons = createIconMock('Ionicons');
const Feather = createIconMock('Feather');
const MaterialIcons = createIconMock('MaterialIcons');
const FontAwesome = createIconMock('FontAwesome');
const FontAwesome5 = createIconMock('FontAwesome5');
const AntDesign = createIconMock('AntDesign');
const Entypo = createIconMock('Entypo');

module.exports = { Ionicons, Feather, MaterialIcons, FontAwesome, FontAwesome5, AntDesign, Entypo };
